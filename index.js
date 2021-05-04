// ================================================
// This file contains the frontend (actual website) JS code
// It is concerned with taking MIDI output from the python backend and presenting it to the user
// ================================================

$(document).ready(function() {
    // Number of players in frontend
    const NUM_PLAYERS = 3
    // The id of the currently selected player (based on user input)
    let selectedPlayer = -1;
    // The port of the python backend (can change dynamically, changes are handled below)
    let pythonPort = 12000;

    // Array of the actual MIDI player elements
    let players = [];
    // and their piano-roll visualisers
    let visualisers = [];
    // Get the player js elements
    for(let i = 0; i < NUM_PLAYERS; i++){
        let playerID = 'player' + (i + 1);
        let player = document.getElementById(playerID);
        players.push(player);
    }
    // Get the visualiser js elements
    for(let i = 0; i < NUM_PLAYERS; i++){
        let visualiserID = 'visualiser' + (i + 1);
        let visualiser = document.getElementById(visualiserID);
        // Set default config
        visualiser.config = {
            noteHeight: 4,
            pixelsPerTimeStep: 20,
            minPitch: 30
        };
        visualisers.push(visualiser);
    }

    // Connection to Node.JS server
    let socket = io();

    // Callback when new MIDI arrives from the python backend
    socket.on('new_midi', function() {
        for(let i = 0; i < NUM_PLAYERS; i++){
            // Set generated midi files to players and visualisers
            let filename = 'midi/generated_' + i + '.mid'
            players[i].src = filename;
            visualisers[i].src = filename;
        }
        // Update button text
        $('#generateBtn').text("Generate");
    });

    // Callback for a new python port received
    socket.on('new_port', function(newPort) {
        pythonPort = newPort;
    });

    // Callback for when user MIDI recording is finished -> send trigger to python backend
    // This will generate 3 new sets of MIDI using the recorded MIDI as conditioned input
    socket.on('finished_writing_recording', function() {
        sendPostRequestToPythonBackend("/from_recorded");
    });

    // Trigger to generate a new set of three 1-bar MIDI segments from scratch in python backend
    function generate_from_scratch(){
        // Update button text
        $('#generateBtn').text("Generating...");
        // Trigger generation in python backend
        sendGetRequestToPythonBackend('/from_scratch');
    }

    // Listen for keyboard events
    document.addEventListener('keydown', (event) => {
        // If user presses 1, 2 or 3 on the keyboard select the respective player and playback MIDI (if exists)
        if (event.key === '1'
            || event.key === '2'
            || event.key === '3'){
            focusPlayerContainer(parseInt(event.key)  - 1);
            players[selectedPlayer - 1].start();
        }
        // Enter key -> generate new MIDI from selected player as condition
        if(event.keyCode === 13){
            // Get selected player ID
            let selID = (selectedPlayer - 1).toString();
            // Trigger generation in python backend
            sendPostRequestToPythonBackend("/from_conditioned", selID);
            // Update button text
            $('#generateBtn').text('Generating more...');
        }
        // Space bar -> play/pause currently selected player
        if(event.keyCode === 32){
            // Get selected player ID
            let selID = (selectedPlayer - 1).toString();
            if(players[selID].playing)
                players[selID].stop();
            else
                players[selID].start();
        }
    });

    // Generate button click handler -> generate new MIDI from scratch
    $('#generateBtn').click(() => {
        generate_from_scratch();
    });

    // Focus players on click of their container (green highlight)
    $('#playerContainer1').click(() => {
        focusPlayerContainer(0);
    });
    $('#playerContainer2').click(() => {
        focusPlayerContainer(1);
    });
    $('#playerContainer3').click(() => {
        focusPlayerContainer(2);
    });

    /**
     * Helper function to style the containers upon click
     * @param containerID The ID of the container to focus
     */
    function focusPlayerContainer(containerID){
        // Remove shadows from all
        for(let i = 0; i < NUM_PLAYERS; i++){
            let playerContainerID = "#playerContainer" + (i + 1);
            $(playerContainerID).removeClass('selected');
        }
        // Update selected player
        selectedPlayer = containerID + 1;
        // Change border of selected div
        let playerContainerID = "#playerContainer" + selectedPlayer;
        $(playerContainerID).addClass('selected');
    }

    /**
     * Helper function to send a GET request to the python backend (used for generating data from scratch)
     * @param url
     */
    function sendGetRequestToPythonBackend(url){
        // Build URL
        let base = "http://localhost:" + pythonPort.toString();
        let address = base + url;
        // Send request
        fetch(address).then(function(response) {
            console.log(response);
            return response.json();
        }).then(function(data) {
            console.log(data);
        }).catch(function() {
            console.log("Booo");
        });
    }

    /**
     * Helper function to send a POST request to the python backend (used for generating MIDI based on previous input -> conditioning)
     * @param url URL to send data to
     * @param data The data to send
     */
    function sendPostRequestToPythonBackend(url, data){
        // Build URL
        let base = "http://localhost:" + pythonPort.toString();
        let address = base + url;
        // Send request
        fetch(address, {
            method: "POST",
            body: JSON.stringify(data)
        }).then(res => {
            console.log("Request complete! response:", res);
        });
    }
});