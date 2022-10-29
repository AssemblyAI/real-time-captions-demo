// required dom elements
const video = document.querySelector('video');
const captions = document.getElementById('captions');
const startButton = document.getElementById('btn-start-recording');
const stopButton = document.getElementById('btn-stop-recording');

// set initial state of application variables
let socket;
let recorder;
captions.style.display = 'none';

// Gets access to the webcam and microphone
const captureCamera = (callback) => {
  navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 1480, height: 720 } })
    .then(camera => {
      callback(camera)
    })
    .catch(error => {
      alert('Unable to capture your camera. Please check console logs.');
      console.error(error);
    }
  );
}

// Stops recording and ends real-time session. 
const stopRecordingCallback = () => {
  socket.send(JSON.stringify({terminate_session: true}));
  socket.close();
  socket = null;

  recorder.camera.stop();
  recorder.destroy();
  recorder = null;
}

//Starts real-time session and trasncription
startButton.onclick = async function () {
  this.disabled = true;
  this.innerText = 'Camera Loading...'
  
  const response = await fetch('http://localhost:8000'); // get temp session token from server.js (backend)
  const data = await response.json();

  if(data.error){
    alert(data.error)
  }

  const { token } = data;

  // establish wss with AssemblyAI (AAI) at 16000 sample rate
  socket = await new WebSocket(`wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${token}`);

  // handle incoming messages to display captions on screen
  const texts = {};
  socket.onmessage = (message) => {
    let msg = '';
    const res = JSON.parse(message.data);
    texts[res.audio_start] = res.text;
    const keys = Object.keys(texts);
    keys.sort((a, b) => a - b);
    for (const key of keys) {
      if (texts[key]) {
        if (msg.split(' ').length > 6) {
          msg = ''
        }  
        msg += ` ${texts[key]}`;     
      }
    }
    captions.innerText = msg; 
  };

  socket.onerror = (event) => {
    console.error(event);
    socket.close();
  }
  
  socket.onclose = event => {
    console.log(event);
    captions.innerText = ''
    socket = null;
  }

  socket.onopen = () => {
    captureCamera(function(camera) {
        startButton.innerText = 'Start Recording'
        video.controls = false;
        video.muted = true;
        video.volume = 0;
        video.srcObject = camera;

        captions.style.display = '';

        // once socket is open, create a new recorder object and start recording (specifications must match real-time requirements)
        recorder = new RecordRTC(camera, {
            type: 'audio',
            mimeType: 'audio/webm;codecs=pcm', // endpoint requires 16bit PCM audio
            recorderType: StereoAudioRecorder,
            timeSlice: 250, // set 250 ms intervals of data that sends to AAI
            desiredSampRate: 16000,
            numberOfAudioChannels: 1, // real-time requires only one channel
            bufferSize: 4096,
            audioBitsPerSecond: 128000,
            ondataavailable: (blob) => {
              const reader = new FileReader();
              reader.onload = () => {
                const base64data = reader.result;

                // audio data must be sent as a base64 encoded string
                if (socket) {
                  socket.send(JSON.stringify({ audio_data: base64data.split('base64,')[1] }));
                }
              };
              reader.readAsDataURL(blob);
            },
        });

        recorder.startRecording();

        // release camera on stopRecording
        recorder.camera = camera;
        stopButton.disabled = false;
    });
  }
};

stopButton.onclick = function() {
  this.disabled = true;
  recorder.stopRecording(stopRecordingCallback);
  startButton.disabled = false;
};