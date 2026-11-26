# AssemblyAI Real-Time Video Captions

This open-source repo demonstrates how to create live video captions using AssemblyAI's [Streaming v3 API](https://assemblyai.com/docs/streaming/getting-started/transcribe-streaming-audio).

The browser shows a live camera preview and sends microphone audio to AssemblyAI as binary PCM over a WebSocket. The Express server exchanges the API key for a temporary streaming token. AssemblyAI sends transcript turns back to the browser, which shows the latest words as captions.

## How To Install and Run the Project

You need Node.js 18 or later, an [AssemblyAI API key](https://assemblyai.com/dashboard/signup) and a browser with camera, microphone and AudioWorklet support. Use `localhost` for local development or HTTPS for a deployed client.

##### Instructions

1. Clone the repo to your local machine.
2. Open the terminal in the root directory of the project.
3. Run `npm install` to install all dependencies.
4. Create a `.env` file in the project root and add this line with your API Key

```
API_KEY=<YOUR API KEY HERE>
```

5. While still in the root directory, start the server with the command `npm run start` (will run on port 8000).
6. Open a second terminal in the root directory of the project and start the client side with `npm run client` (will run on port 3000).
7. Navigate to http://localhost:3000, click **Start Recording** and grant camera and microphone access. Click **Stop Recording** to release both devices and end the streaming session.

Run `npm test` to check the token, audio and caption paths with offline mocks.

## Further Documentation

- [Streaming message sequence](https://assemblyai.com/docs/streaming/message-sequence)
- [Temporary streaming tokens](https://assemblyai.com/docs/streaming/authenticate-with-a-temporary-token)
- [Express](https://expressjs.com/)
- [dotenv](https://github.com/motdotla/dotenv)

Contact Us
--
If you have any questions, please feel free to reach out to our Support team - support@assemblyai.com!
