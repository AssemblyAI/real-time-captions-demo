const video = document.querySelector('video');
const captions = document.getElementById('captions');
const startButton = document.getElementById('btn-start-recording');
const stopButton = document.getElementById('btn-stop-recording');

const sampleRate = 16000;
const speechModel = 'assemblyai-stt-3-7-realtime';
const startTimeoutMs = 10_000;
const stopTimeoutMs = 5_000;
const tokenUrl = window.location.hostname === 'localhost'
  ? 'http://localhost:8000/'
  : 'https://broken-smoke-9608.fly.dev/';

let recording;
captions.style.display = 'none';

function stopTracks(stream) {
  stream.getTracks().forEach(track => track.stop());
}

function releaseMedia(session) {
  if (session.stream) {
    stopTracks(session.stream);
    session.stream = null;
    video.srcObject = null;
  }
  if (session.audio) {
    session.audio.close().catch(() => {});
    session.audio = null;
  }
}

function finish(session, error) {
  if (recording !== session) return;
  recording = null;
  clearTimeout(session.timer);
  session.request.abort();
  releaseMedia(session);
  if (session.socket && session.socket.readyState < WebSocket.CLOSING) session.socket.close();
  startButton.disabled = false;
  startButton.innerText = 'Start Recording';
  stopButton.disabled = true;
  if (error) alert(error);
}

function startAudio(session) {
  const source = session.audio.createMediaStreamSource(session.stream);
  const processor = new AudioWorkletNode(session.audio, 'pcm-encoder', {
    channelCount: 1,
    channelCountMode: 'explicit',
  });
  processor.port.onmessage = ({ data }) => {
    if (recording === session && !session.stopping && session.socket.readyState === WebSocket.OPEN) {
      session.socket.send(data);
    }
  };
  processor.onprocessorerror = () => finish(session, 'Could not process the microphone audio.');
  source.connect(processor);
  // The worklet outputs silence. Connecting it keeps it processing without microphone playback.
  processor.connect(session.audio.destination);
  video.controls = false;
  video.muted = true;
  video.srcObject = session.stream;
  captions.style.display = '';
  startButton.innerText = 'Start Recording';
  clearTimeout(session.timer);
}

function handleMessage(session, event) {
  if (recording !== session) return;
  try {
    const message = JSON.parse(event.data);
    if (message?.type === 'Begin' && !session.stopping) {
      startAudio(session);
    } else if (message?.type === 'Turn' && typeof message.transcript === 'string') {
      // Each Turn for the current turn replaces the previous transcript.
      captions.innerText = message.transcript.trim().split(/\s+/).slice(-6).join(' ');
    } else if (message?.type === 'Termination') {
      finish(session);
    } else if (message?.type === 'Error') {
      finish(session, 'AssemblyAI could not continue the transcription.');
    }
  } catch (error) {
    finish(session, `Could not continue recording: ${error.message}`);
  }
}

startButton.onclick = async () => {
  if (recording) return;
  const session = { request: new AbortController() };
  recording = session;
  startButton.disabled = true;
  startButton.innerText = 'Camera Loading...';
  stopButton.disabled = false;
  captions.innerText = '';
  captions.style.display = 'none';

  try {
    session.audio = new AudioContext({ sampleRate });
    const audioReady = session.audio.resume().catch(error => finish(session, error.message));
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 1480, height: 720 } });
    if (recording !== session) {
      stopTracks(stream);
      return;
    }
    session.stream = stream;
    session.timer = setTimeout(() => finish(session, 'Timed out starting transcription.'), startTimeoutMs);
    await audioReady;
    if (recording !== session) return;
    await session.audio.audioWorklet.addModule('./js/pcm-encoder.js');
    if (recording !== session) return;

    const response = await fetch(tokenUrl, { signal: session.request.signal });
    const data = await response.json();
    if (!response.ok || typeof data?.token !== 'string' || !data.token) {
      throw new Error(data?.error || 'Could not get a streaming token.');
    }
    if (recording !== session) return;
    const query = new URLSearchParams({
      sample_rate: sampleRate,
      encoding: 'pcm_s16le',
      speech_model: speechModel,
      token: data.token,
    });
    const socket = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?${query}`);
    session.socket = socket;
    socket.onmessage = event => handleMessage(session, event);
    socket.onerror = () => finish(session, 'Could not connect to AssemblyAI streaming.');
    socket.onclose = () => finish(session, session.stopping ? undefined : 'The streaming connection closed.');
  } catch (error) {
    finish(session, `Could not start recording: ${error.message}`);
  }
};

stopButton.onclick = () => {
  const session = recording;
  if (!session || session.stopping) return;
  session.stopping = true;
  stopButton.disabled = true;
  clearTimeout(session.timer);
  releaseMedia(session);

  if (session.socket?.readyState !== WebSocket.OPEN) {
    finish(session);
    return;
  }
  // Keep the socket open for AssemblyAI to deliver the last Turn and Termination.
  session.socket.send(JSON.stringify({ type: 'Terminate' }));
  session.timer = setTimeout(() => finish(session), stopTimeoutMs);
};

window.addEventListener('pagehide', () => {
  stopButton.onclick();
  if (recording) finish(recording);
});
