import {MidiParser} from './midi-parser/midi-parser.js'

// ref: https://sites.google.com/site/yyagisite/material/smfspec
const META_TYPE_TEMPO = 81;
const META_TYPE_BEAT = 88;
const META_TYPE_TRACK_END = 47;
const DATA_TYPE_NOTE = 9;
const notes = {
    53: 'F3',
    54: 'F3#/G3b',
    55: 'G3',
    56: 'G3#/A3b',
    57: 'A3',
    58: 'A3#/B3b',
    59: 'B3',
    60: 'C4',
    61: 'C4#/D4b',
    62: 'D4',
    63: 'D4#/E4b',
    64: 'E4',
    65: 'F4',
    66: 'F4#/G4b',
    67: 'G4',
    68: 'G4#/A4b',
    69: 'A4',
    70: 'A4#/B4b',
    71: 'B4',
    72: 'C5',
    73: 'C5#/D5b',
    74: 'D5',
    75: 'D5#/E5b',
    76: 'E5',
    77: 'F5',
    78: 'F5#/G5b',
    79: 'G5',
}

// select the INPUT element that will handle
// the file selection.
let source = document.getElementById('filereader');

let tempo = null;   // duration of chrochet [usec]

let noteSequence = [];
let currentSequenceIndex = 0;

let totalTimeDeltas = null;

let crochetTimeDivision = null;

let durationsPerDelta = null;   // [msec/delta]

let pauseStart = null;

let beat = [];

let minDelta = Number.MAX_VALUE;

let sectionsOfNotes = {};

const getTotalNoteCount = () => {
    const notes = Object.keys(sectionsOfNotes);
    let total = 0;
    for (const note of notes) {
        total += sectionsOfNotes[note].length;
    }
    return total;
}

const getNumberOfSectionsInBar = () => {
    return beat[0] * ((crochetTimeDivision / (beat[1] / 4)) / minDelta);
}

// provide the File source and a callback function
MidiParser.parse(source, function(obj){
    console.log(obj);

    tempo = null;   // duration of chrochet [usec]
    noteSequence = [];
    totalTimeDeltas = null;
    durationsPerDelta = null;   // [msec/delta]
    pauseStart = null;
    beat = [];
    minDelta = Number.MAX_VALUE;
    sectionsOfNotes = {};

    crochetTimeDivision = obj.timeDivision;
    if (obj.tracks.length < 1) return;
    if (!totalTimeDeltas) totalTimeDeltas = [...new Array(obj.tracks)].map(() => 0);
    const deltas = {};
    const notesInTimes = {};
    obj.track[0].event.forEach((e) => {
        console.log(e);
        if (e.metaType === META_TYPE_TEMPO) {
            tempo = e.data;
            durationsPerDelta = Math.round((tempo/1e3) / crochetTimeDivision);
            console.log(60 / (tempo/1e6));
            document.getElementById('tempo').innerText = `${60 / (tempo/1e6)}`;
        }
        else if (e.metaType == META_TYPE_BEAT) {
            beat.push(e.data[0]);
            beat.push(Math.pow(2, e.data[1]));
            document.getElementById('beat').innerText = `${beat[0]}/${beat[1]}`;
        }
        else if (e.type == META_TYPE_TRACK_END) {
            totalTimeDeltas[0] += e.deltaTime;
        }
        else if (e.type === DATA_TYPE_NOTE) {
            totalTimeDeltas[0] += e.deltaTime;
            noteSequence.push({
                deltaTime: e.deltaTime,
                data: e.data,
                durationInDelta: totalTimeDeltas[0],
                duration: totalTimeDeltas[0] * durationsPerDelta
            });
            if (e.data[1] > 0) {
                deltas[e.data[0]] = totalTimeDeltas[0];
                if (!notesInTimes[totalTimeDeltas[0]]) notesInTimes[totalTimeDeltas[0]] = [];
                notesInTimes[totalTimeDeltas[0]].push(e.data[0]);
            } else if (totalTimeDeltas[0] - deltas[e.data[0]] > 0) {
                minDelta = Math.min(minDelta, totalTimeDeltas[0] - deltas[e.data[0]]);
            }
        }
    });
    minDelta = crochetTimeDivision / Math.round(crochetTimeDivision / minDelta);
    const notesInSections = {};
    const keyDeltas = Object.keys(notesInTimes);
    for (let i = 0; i < keyDeltas.length; i++) {
        const key = keyDeltas[i];
        const sectionIndex = Math.floor(parseInt(key) / minDelta);
        const sectionNumber = sectionIndex + 1;
        notesInSections[sectionIndex] = notesInTimes[key];
        const notes = notesInTimes[key];
        for (let note of notes) {
            if (!sectionsOfNotes[note]) sectionsOfNotes[note] = [];
            sectionsOfNotes[note].push(sectionNumber);
        }
    }
    console.log(noteSequence);
    console.log(totalTimeDeltas);
    console.log(notesInSections);
    console.log(sectionsOfNotes);
    const command = `notes/${JSON.stringify(sectionsOfNotes)}`;
    console.log(command);
    sendToMicrobit(command);
    setTimeout(() => {
        document.querySelectorAll('.note-info:not(.ok)').forEach((elm) => {
            elm.classList.add('fail');
        });
    }, 10000);
    console.log(minDelta, Math.ceil(totalTimeDeltas[0] / minDelta));
    const sortedNotes = Object.keys(sectionsOfNotes).sort();
    let usedNotesList = [];
    for (let i = 0; i < sortedNotes.length; i++) {
        const n = sortedNotes[i];
        usedNotesList.push(`<span class="note-info" data-note="${n}">${notes[n]}(${n}): ${sectionsOfNotes[n].length} times</span>`);
    }
    document.getElementById('used_notes').innerHTML = `<span>${sortedNotes.length} notes</span><span>: </span>${usedNotesList.join(', ')}`;
    document.querySelectorAll('.note-info').forEach((elm) => {
        elm.addEventListener('click', (e) => {
            e.preventDefault();
            const note = Number(elm.getAttribute('data-note'));
            console.log(sectionsOfNotes[note]);
            const command = `detect/${note}/${getTotalNoteCount()}`;
            sendToMicrobit(command);
        }, false);
    });

    const totalSections = Math.ceil(totalTimeDeltas[0] / minDelta);
    const container = document.getElementById('section_container');
    container.innerHTML = '';
    for (let i = 0; i < totalSections; i++) {
        const div = document.createElement('div');
        div.setAttribute('data-num', i + 1);
        div.classList.add('section');
        if ((i + 1) % getNumberOfSectionsInBar() === 0) {
            div.classList.add('bar');
        }
        if (notesInSections[i]) {
            div.innerHTML = notesInSections[i].map((e) => `<span class="note-name">${notes[e]}</span>`).join('<br/>');
        }
        container.append(div);
    }
});

let systemMillsAtBegin = null;
let interval = null;
let currentNotes = [];
let counting = null;
const updatePlay =() => {
    const now = Date.now();
    const factor = parseFloat(document.getElementById('factor').value);
    if (!factor) factor = 1.0;

    if (pauseStart) {
        systemMillsAtBegin += now - pauseStart;
        pauseStart = null;
    } else if (counting === null) {    // play from the beginning
        const count = document.getElementById('count').checked;
        if (count && !counting) {
            console.log(minDelta, getNumberOfSectionsInBar());
            counting = 0;
        }
    }
    let currentDuration = now - systemMillsAtBegin;
    let currentDelta = Math.floor(currentDuration / durationsPerDelta);
    // counting before beginning
    if (counting !== null && counting <= getNumberOfSectionsInBar()) {
        counting = Math.floor(currentDelta / minDelta);
        if (counting > getNumberOfSectionsInBar()) {
            systemMillsAtBegin = now;
            currentDuration = 0;
            currentDelta = 0;
            document.getElementById('current_count').innerText = '';
        } else if (counting >= 0) {
            if (counting > 0) {
                const command = `count/${counting}/${getNumberOfSectionsInBar()}`;
                sendToMicrobit(command);
                document.getElementById('current_count').innerText = `${counting}/${getNumberOfSectionsInBar()}`;
            }
            return;
        }
    }
    if (currentDelta > totalTimeDeltas[0]) {
        const repeat = document.getElementById('repeat').checked;
        if (repeat) {
            systemMillsAtBegin = Date.now();
            currentDuration = 0;
            currentDelta = 0;
            currentSequenceIndex = 0;
            pauseStart = null;
            currentNotes = [];
        } else {
            clearInterval(interval);
            interval = null;
            currentDuration = 0;
            currentDelta = 0;
            systemMillsAtBegin = null;
            currentSequenceIndex = 0;
            pauseStart = null;
            counting = null;
            currentNotes = [];
            const currentSection = document.querySelector('.section.current');
            if (currentSection) currentSection.classList.remove('current');
            sendToMicrobit('end/');
            return;
        }
    }
    const currentSection = document.querySelector('.section.current');
    if (currentSection) currentSection.classList.remove('current');
    const sectionNumber = Math.floor(currentDelta / minDelta) + 1;
    const command = `section/${sectionNumber}`;
    sendToMicrobit(command);
    const div = document.querySelector(`.section[data-num="${sectionNumber}"]`);
    if (div) {
        div.classList.add('current');
    }

    while(true) {
        const note = noteSequence[currentSequenceIndex];
        if (!note || note.duration > currentDuration) break;
        if (note.data[1] > 0) {
            currentNotes.push(note.data[0]);
        } else {
            const index = currentNotes.indexOf(note.data[0]);
            if (index >= 0) currentNotes.splice(index, 1);
        }
        currentSequenceIndex += 1;
    }
};

const minPlayInterval = 100;
document.getElementById('play').addEventListener('click', (e) => {
    e.preventDefault();
    if (interval || !crochetTimeDivision) return;
    if (!systemMillsAtBegin) systemMillsAtBegin = Date.now();
    const intervalDuration = Math.max(minPlayInterval, durationsPerDelta);
    interval = setInterval(updatePlay, intervalDuration);
    console.log('play');
}, false);

document.getElementById('pause').addEventListener('click', (e) => {
    e.preventDefault();
    if (!interval) return;
    clearInterval(interval);
    interval = null;
    console.log('pause');
    pauseStart = Date.now();
}, false);

document.getElementById('stop').addEventListener('click', (e) => {
    e.preventDefault();
    if (!interval) return;
    clearInterval(interval);
    interval = null;
    systemMillsAtBegin = null;
    currentSequenceIndex = 0;
    pauseStart = null;
    counting = null;
    currentNotes = [];
    const currentSection = document.querySelector('.section.current');
    if (currentSection) currentSection.classList.remove('current');
    sendToMicrobit('end/');
    console.log('stop');
}, false);

/*
document.getElementById('repeat').addEventListener('change', (e) => {
    e.preventDefault();
}, false)
*/

const repeatNoteDetect = (notes, totalNoteCount) => {
    const note = notes[0];
    const remainingNotes = notes.slice(1);
    const command = `detect/${note}/${totalNoteCount}}`;
    sendToMicrobit(command);
    if (remainingNotes.length > 0) {
        setTimeout(() => {
            repeatNoteDetect(remainingNotes, totalNoteCount);
        }, 10);
    }
}

document.getElementById('detect_all_notes').addEventListener('click', (e) => {
    e.preventDefault();
    const notes = [];
    document.querySelectorAll('.note-info').forEach((elm) => {
        const note = elm.getAttribute('data-note');
        notes.push(note);
    })
    const totalNoteCount = getTotalNoteCount();
    repeatNoteDetect(notes, totalNoteCount);
}, false);










/***************************************
 * micro:bit connection
 ***************************************/

/*
 * JavaScript functions for interacting with micro:bit microcontrollers over WebUSB
 * (Only works in Chrome browsers;  Pages must be either HTTPS or local)
 */

// Add a delay() method to promises 
// NOTE: I found this on-line somewhere but didn't note the source and haven't been able to find it!
Promise.delay = function(duration){
    return new Promise(function(resolve, reject){
        setTimeout(function(){
            resolve();
        }, duration)
    });
}

const MICROBIT_VENDOR_ID = 0x0d28
const MICROBIT_PRODUCT_ID = 0x0204
const MICROBIT_DAP_INTERFACE = 4

const controlTransferGetReport = 0x01
const controlTransferSetReport = 0x09
const controlTransferOutReport = 0x200
const controlTransferInReport = 0x100

const uBitBadMessageDelay = 500         // Delay if message failed
const uBitIncompleteMessageDelay = 150  // Delay if no message ready now
const uBitGoodMessageDelay = 20         // Time to try again if message was good


const DAPOutReportRequest = {
    requestType: "class",
    recipient: "interface",
    request: controlTransferSetReport,
    value: controlTransferOutReport,
    index: MICROBIT_DAP_INTERFACE
}

const DAPInReportRequest =  {
    requestType: "class",
    recipient: "interface",
    request: controlTransferGetReport,
    value: controlTransferInReport,
    index: MICROBIT_DAP_INTERFACE
}


/*
   Open and configure a selected device and then start the read-loop
 */
function uBitOpenDevice(device, callback) {
    let buffer=""                               // Buffer of accumulated messages
    let decoder = new TextDecoder("utf-8")      // Decoder for byte->utf conversion
    const parser = /([^.:]*)\.*([^:]+|):(.*)/   // Parser to identify time-series format (graph:info or graph.series:info)

    let transferLoop = function () {
        device.controlTransferOut(DAPOutReportRequest, Uint8Array.from([0x83])) // DAP ID_DAP_Vendor3: https://github.com/ARMmbed/DAPLink/blob/0711f11391de54b13dc8a628c80617ca5d25f070/source/daplink/cmsis-dap/DAP_vendor.c
          .then(() => device.controlTransferIn(DAPInReportRequest, 64))
          .then((data) => { 
            if (data.status != "ok") {
                return Promise.delay(uBitBadMessageDelay).then(transferLoop);
            }
            // First byte is echo of get UART command: Ignore it

            let arr = new Uint8Array(data.data.buffer)
            if(arr.length<2)  // Not a valid array: Delay
                return Promise.delay(uBitIncompleteMessageDelay).then(transferLoop)

            // Data: Process and get more
            let len = arr[1]  // Second byte is length of remaining message
            if(len==0) // If no data: Delay
                return Promise.delay(uBitIncompleteMessageDelay).then(transferLoop)
            
            let msg = arr.slice(2,2+len)  // Get the actual UART bytes
            let string =  decoder.decode(msg);
            buffer += string;
            let firstNewline = buffer.indexOf("\n")
            while(firstNewline>=0) {
                let messageToNewline = buffer.slice(0,firstNewline)
                let now = new Date() 

                let dataBundle = {time: now, data: messageToNewline}
                callback("console", device, dataBundle)

                /*
                // Deal with line
                // If it's a graph/series format, break it into parts
                let parseResult = parser.exec(messageToNewline)
                if(parseResult) {
                    let graph = parseResult[1]
                    let series = parseResult[2]
                    let data = parseResult[3]
                    let callbackType = "graph-event"
                    // If data is numeric, it's a data message and should be sent as numbers
                    if(!isNaN(data)) {
                        callbackType = "graph-data"
                        data = parseFloat(data)
                    }
                    // Build and send the bundle
                    let dataBundle = {
                        time: now,
                        graph: graph, 
                        series: series, 
                        data: data
                    }
                    callback(callbackType, device, dataBundle)
                } else {
                    // Not a graph format.  Send it as a console bundle
                    let dataBundle = {time: now, data: messageToNewline}
                    callback("console", device, dataBundle)
                }
                */

                buffer = buffer.slice(firstNewline+1)  // Advance to after newline
                firstNewline = buffer.indexOf("\n")    // See if there's more data
            }
            // Delay long enough for complete message
            return Promise.delay(uBitGoodMessageDelay).then(transferLoop);
        })
        // Error here probably means micro:bit disconnected
        .catch(error => { if(device.opened) callback("error", device, error); device.close(); callback("disconnected", device, null);});
    }

    function controlTransferOutFN(data) {
        return () => { return device.controlTransferOut(DAPOutReportRequest, data) }
    }
    
    device.open()
          .then(() => device.selectConfiguration(1))
          .then(() => device.claimInterface(4))
          .then(controlTransferOutFN(Uint8Array.from([2, 0])))  // Connect in default mode: https://arm-software.github.io/CMSIS_5/DAP/html/group__DAP__Connect.html
          .then(controlTransferOutFN(Uint8Array.from([0x11, 0x80, 0x96, 0x98, 0]))) // Set Clock: 0x989680 = 10MHz : https://arm-software.github.io/CMSIS_5/DAP/html/group__DAP__SWJ__Clock.html
          .then(controlTransferOutFN(Uint8Array.from([0x13, 0]))) // SWD Configure (1 clock turn around; no wait/fault): https://arm-software.github.io/CMSIS_5/DAP/html/group__DAP__SWD__Configure.html
          .then(controlTransferOutFN(Uint8Array.from([0x82, 0x00, 0xc2, 0x01, 0x00]))) // Vendor Specific command 2 (ID_DAP_Vendor2): https://github.com/ARMmbed/DAPLink/blob/0711f11391de54b13dc8a628c80617ca5d25f070/source/daplink/cmsis-dap/DAP_vendor.c ;  0x0001c200 = 115,200kBps
          .then(() => { callback("connected", device, null); return Promise.resolve()}) 
          .then(transferLoop)
          .catch(error => callback("error", device, error))
}

/**
 * Disconnect from a device 
 * @param {USBDevice} device to disconnect from 
 */
function uBitDisconnect(device) {
    if(device && device.opened) {
        device.close()
    }
}

/**
 * Send a string to a specific device
 * @param {USBDevice} device 
 * @param {string} data to send (must not include newlines)
 */
function uBitSend(device, data) {
    if(!device.opened)
        return
    // Need to send 0x84 (command), length (including newline), data's characters, newline
    let fullLine = data+'\n'
    let encoded = new TextEncoder("utf-8").encode(fullLine)
    let message = new Uint8Array(1+1+fullLine.length)
    message[0] = 0x84
    message[1] = encoded.length
    message.set(encoded, 2)
    device.controlTransferOut(DAPOutReportRequest, message) // DAP ID_DAP_Vendor3: https://github.com/ARMmbed/DAPLink/blob/0711f11391de54b13dc8a628c80617ca5d25f070/source/daplink/cmsis-dap/DAP_vendor.c
}


/**
 * Callback for micro:bit events
 * 
 
   Event data varies based on the event string:
  <ul>
   <li>"connection failure": null</li>
   <li>"connected": null</li>
   <li>"disconnected": null</li>
   <li>"error": error object</li>
   <li>"console":  { "time":Date object "data":string}</li>
   <li>"graph-data": { "time":Date object "graph":string "series":string "data":number}</li>
   <li>"graph-event": { "time":Date object "graph":string "series":string "data":string}</li>
  </ul>

 * @callback uBitEventCallback
 * @param {string} event ("connection failure", "connected", "disconnected", "error", "console", "graph-data", "graph-event" )
 * @param {USBDevice} device triggering the callback
 * @param {*} data (event-specific data object). See list above for variants
 * 
 */


/**
 * Allow users to select a device to connect to.
 * 
 * @param {uBitEventCallback} callback function for device events
 */
function uBitConnectDevice(callback) { 
    navigator.usb.requestDevice({filters: [{ vendorId: MICROBIT_VENDOR_ID, productId: 0x0204 }]})
        .then(  d => { if(!d.opened) uBitOpenDevice(d, callback)} )
        .catch( () => callback("connection failure", null, null))
}



// Append a line to the console frame
function consolePrintln(message) {
    var con = document.getElementById("console")
    con.innerHTML += "<br/>"+message
    con.scrollTop = con.scrollHeight
}

// List of connected devices (a single value could be used if only connecting to one device)
var connectedDevices = []

// Example event call-back handler
function uBitEventHandler(reason, device, data) {
    switch(reason) {
        case "connected":
            consolePrintln("<p>Connected!</p>")
            connectedDevices.push(device)
            break
        case "disconnected":
            consolePrintln("<p>Disconnected</p>")
            connectedDevices = connectedDevices.filter( v => v != device)
            break
        case "connection failure":
            consolePrintln("<p>Connection Failure</p>")
            break
        case "error":
            consolePrintln("<p>Error</p>")
            break
        case "console":
            const [command, value] = data.data.split('/');
            if (command === 'note') {
                console.log(data.data);
                const [command, note, status] = data.data.split('/').map((t, i) => {return i === 0 ? t : parseInt(t)});
                const noteInfo = document.querySelector(`.note-info[data-note="${note}"]`);
                if (noteInfo) {
                    noteInfo.classList.remove('ok');
                    noteInfo.classList.remove('fail');
                    noteInfo.classList.add(status === 1 ? 'ok' : 'fail');
                }
            }
            break
        case "graph-event":
            consolePrintln(`Graph Event:  ${data.data} (for ${data.graph}${data.series.length?" / series "+data.series:""})`)
            break
        case "graph-data":
            consolePrintln(`Graph Data: ${data.data} (for ${data.graph}${data.series.length?" / series "+data.series:""})`)
            break
    }
}

// Make the "go" button open the request devices box
document.getElementById("connect").addEventListener("click", () => uBitConnectDevice(uBitEventHandler))
document.getElementById("disconnect").addEventListener("click", () => connectedDevices.forEach(d=>uBitDisconnect(d)))
document.getElementById("clear").addEventListener("click", () => { document.getElementById("console").innerHTML = "" })
document.getElementById("test").addEventListener("click", () => {
    const data = JSON.stringify({"64":[2,4]});
    //const command = `notes/${data}`;
    const command = 'notes/{"64":[1,2,3,4,5]}';
    //const command = `test/abc`;
    //const command = `count/1/12`;
    //const command = `section/100`;
    //connectedDevices.forEach(d=>uBitSend(d, command));
    sendToMicrobit(command);
});

const packetDataLength = 18;
const sendToMicrobit = (command) => {
    let packet = '';
    if (command.length < packetDataLength) packet += '9'; // end of packet
    else packet += '0';
    packet += command.slice(0, packetDataLength);
    command = command.slice(packetDataLength);
    //console.log(packet);
    connectedDevices.forEach(d=>uBitSend(d, packet));
    if (command.length > 0) {
        setTimeout(() => {
            sendToMicrobit(command);
        }, 10);    // baud rate: 115200 [bit/sec]
    }
};
