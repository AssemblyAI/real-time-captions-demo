# AssemblyAI Real-Time Video Captions

## Description

This open-source repo demonstrates how to create live video captions using AssemblyAI's [real-time API](https://www.assemblyai.com/docs/walkthroughs#realtime-streaming-transcription)!

This app uses a web camera to record live video. It will also grab an audio stream from the user's computer and then send that over a WebSocket to AssemblyAI for real-time transcription. Once AssemblyAI begins transcribing, live captions will be displayed on the video. This is accomplished using Express for our backend and Vanilla JavaScript with the npm package [recordrtc](https://www.npmjs.com/package/recordrtc) for our front-end.

## How To Install and Run the Project

##### ❗Important❗

- Before running this app, you need to upgrade your AssemblyAI account. The real-time API is only available to upgraded accounts at this time.
- Running the app before upgrading will cause an **error with a 402 status code.** ⚠️
- To upgrade your account you need to add a card. You can do that in your dashboard [here](https://app.assemblyai.com/)!

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
7. Navigate to http://localhost:3000 in your browser and click "Start Recording" to see the live captions!

## Further Documentation

- [AssemblyAI Real-Time Documention](https://docs.assemblyai.com/overview/real-time-transcription)
- [recordrtc](https://www.npmjs.com/package/recordrtc)
- [Express](https://expressjs.com/)
- [dotenv](https://www.npmjs.com/package/dotenv)
