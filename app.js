'use strict'
// ================================================
// This file contains all Node.JS server code
// It serves html, js and css files and reads and writes MIDI
// ================================================

// For the web server
const http = require('http');
// To read from and write to files
const path = require('path');
const fs = require('fs');
// App management
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors')
const app = express()
app.use(express.static('.'))
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.raw());

// For communicating between Node.JS and HTML/JS in the browser
const { Server } = require("socket.io");
// For creating a MIDI track from user recording
const MidiWriter = require('midi-writer-js');

// Create the server
const server = http.createServer(app);
const io = new Server(server);
// Set the timeout high so no requests are lost
server.setTimeout(500000);

// Initial port of the python application - this can be changed when the python application starts
// And port is already taken. If that is the case the port here is updated via a POST request from the python backend
let pythonPort = 12000;
// Placeholder for the current client
let clientSocket;

// Initialise a MIDI track to write to for user recording
let track = new MidiWriter.Track();
// Current limitation: BPM for user recording is fixed
let BPM = 120;

// Node.JS server address
const YOUR_IP_ADDRESS = "http://localhost"

// Node.JS server port
const port = 5000;

// Handle request for "http://localhost:port/" -> serve index.html
app.get('/', cors(), (req, res) => {
    handleRequest(req, res);
});

// Callback for when a new set of 3 MIDI bars comes in from the python backend
app.post('/midi_ready', cors(),(req, res) => {
    res.send('POST request - midi ready in frontend!');

    if(clientSocket !== undefined){
        clientSocket.emit('new_midi');
    }
});

// Callback for when the python backend server port changes
app.post('/python_port', cors(),(req, res) => {
    res.send('POST request - Got new port!');

    let new_port = parseInt(req.body.new_port);
    // Update port to make sure all communications work correctly
    pythonPort = new_port;

    // Also update python port in HTML/JS
    if(clientSocket !== undefined){
        clientSocket.emit('new_port', new_port);
    }
});

// Start Node.JS server and listen on port
server.listen(port, () => {
    console.log('listening on port ' + port);
});

// For communication between Node.JS server and http client (web browser)
io.on('connection', (socket) => {
    // Update client socket with most recent connection
    clientSocket = socket;
    console.log('a user connected');
    // Always send newest python port to HTML/JS
    socket.emit('new_port', pythonPort);

    // Callback for new note coming in from HTML user recorded MIDI
    socket.on('new_note', (noteName, start, duration) => {
        // Convert start to startTick
        let startTick = start / 4.0;
        // Determine note duration
        // Map note duration from ms to beats
        let beatsPerSecond = BPM / 60;
        let durationBeats = (duration * 0.001) * beatsPerSecond;
        let Tn = 'T' + Math.floor(durationBeats * BPM).toString();

        // Create a new note event to write to the MIDI track
        let note = new MidiWriter.NoteEvent({
            pitch: [noteName],
            duration: Tn,
            startTick: startTick});
        // Add note to track
        track.addEvent(note);
        console.log("Added new note!");
    });

    // Callback for when user starts a new MIDI recording by pressing the 'record' button in HTML
    socket.on('new_track', () => {
        // Start with a new track
        track = new MidiWriter.Track();
        track.setTempo(BPM);
        track.setTimeSignature(4, 4);
        // Define an instrument (optional):
        track.addEvent(new MidiWriter.ProgramChangeEvent({instrument: 2}));
        track.addInstrumentName("Piano")
    });

    // Callback for when a user recording is finished
    // Take all MIDI notes the user recorded and save to 'midi/my_recording.mid'
    socket.on('write_midi', async () => {
        // Delete old midi file if exists
        removeFile('midi/my_recording.mid');
        // Weird bug where sometimes there's conflicting midi data in a file writing immediately after deleting
        // This remedies it
        await sleep(100);
        // Write MidiWriter track to *.mid file
        let write = new MidiWriter.Writer(track);
        console.log(write.dataUri());
        // Take everything after the base64 section -> raw data
        const rawData = write.dataUri().split(';base64,').pop();
        // Write to file
        fs.writeFileSync('midi/my_recording.mid', rawData,{encoding:'base64'});

        // Copy played midi into python folder
        let parentDir = path.dirname(path.resolve(__dirname, ''));
        // Copy to "../PopMusicTransformerPytorch/src/transformer/result/my_recording.mid"
        let destDir = parentDir + path.sep +
            "PopMusicTransformerPytorch" + path.sep +
            "src" + path.sep +
            "transformer" + path.sep +
            "result/my_recording.mid";
        fs.copyFile('midi/my_recording.mid', destDir, (err) => {
            if (err) {
                console.log("Couldn't copy, error: ", err);
            }
            console.log('Midi file copied successfully.');
        });
        await sleep(100);
        // Tell HTML
        clientSocket.emit('finished_writing_recording');
        socket.emit('finished_writing_recording');
    });
});

/**
 * Handler for requests FROM HTML to the Node.JS server -> loads the index.html and *.js and *.css files
 * @param req The request
 * @param res The response -> contains the website data
 */
function handleRequest(req, res) {
    // What did we request?
    let pathname = req.url;

    // If blank load index.html
    if (pathname === '/') {
        pathname = '/index.html';
    }

    // What's the file extension of the request
    let ext = path.extname(pathname);

    // Map extension to file type
    const typeExt = {
        '.html': 'text/html',
        '.js':   'text/javascript',
        '.css':  'text/css'
    };

    // What is it?  Default to plain text
    let contentType = typeExt[ext] || 'text/plain';

    // Now read and write back the file with the appropriate content type
    fs.readFile(__dirname + pathname,
        function (err, data) {
            if (err) {
                res.writeHead(500);
                return res.end('Error loading ' + pathname);
            }
            // Dynamically set content type
            // and attach CORS headers
            res.writeHead(200,{
                'Content-Type': contentType ,
                'Access-Control-Allow-Origin': YOUR_IP_ADDRESS + ":" + port,
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, PATCH, DELETE',
                'Access-Control-Allow-Headers': 'X-Requested-With,content-type',
                'Access-Control-Allow-Credentials': true
            });

            // Send response with data (either HTML, js or css file)
            res.end(data);
        }
    );
}

/**
 * Helper function to pause the JS execution for given amount of milliseconds
 * @param ms The milliseconds to pause duration for
 * @returns {Promise<unknown>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper function to remove a file from a path
 * @param path
 */
function removeFile(path){
    fs.stat(path, function (err, stats) {
        if (err) {
            // File doesn't exist
            return;
        }
        // Actually remove the file
        fs.unlinkSync(path);
    });
}