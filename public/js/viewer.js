window.onload = () => {
    document.getElementById('my-button').onclick = () => {
        init();
    }
}

let streamId = "123";

async function init() {
    const peer = createPeer(streamId);
    peer.addTransceiver("video", { direction: "recvonly" });
    peer.addTransceiver("audio", { direction: "recvonly" });
}

function createPeer(streamId) {
    const peer = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.stunprotocol.org" },
            {
                urls: "turn:openrelay.metered.ca:80",
                username: "openrelayproject",
                credential: "openrelayproject"
            },
            {
                urls: "turn:openrelay.metered.ca:443",
                username: "openrelayproject",
                credential: "openrelayproject"
            },
            {
                urls: "turn:openrelay.metered.ca:443?transport=tcp",
                username: "openrelayproject",
                credential: "openrelayproject"
            }
        ]
    });

    peer.ontrack = handleTrackEvent;
    peer.onnegotiationneeded = () => handleNegotiationNeededEvent(peer, streamId);

    return peer;
}

//async function handleNegotiationNeededEvent(peer, streamId) {
//    const offer = await peer.createOffer();
//    await peer.setLocalDescription(offer);
//
//    const payload = { streamId, sdp: peer.localDescription };
//
//    try {
//        const { data } = await axios.post('/consumer', payload);
//        const desc = new RTCSessionDescription(data.sdp);
//        peer.setRemoteDescription(desc);
//    } catch (error) {
//        console.error("Error during consuming stream:", error);
//    }
//}

// Add this helper function at the bottom of both js/stream.js and js/viewer.js
function waitForIce(peer) {
    return new Promise(resolve => {
        if (peer.iceGatheringState === 'complete') {
            resolve();
        } else {
            function checkState() {
                if (peer.iceGatheringState === 'complete') {
                    peer.removeEventListener('icegatheringstatechange', checkState);
                    resolve();
                }
            }
            peer.addEventListener('icegatheringstatechange', checkState);
        }
    });
}

// Update handleNegotiationNeededEvent in BOTH files
async function handleNegotiationNeededEvent(peer, streamId) {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    // WAIT HERE so the SDP includes the candidates (IPs)
    await waitForIce(peer);

    // Determine endpoint based on which file we are in (broadcast or consumer)
    // Note: You need to know which endpoint to hit.
    // In stream.js use '/broadcast', in viewer.js use '/consumer'
    const endpoint = (location.pathname.includes('viewer')) ? '/consumer' : '/broadcast';
    // Or just manually keep them separate as you had them.

    const payload = { streamId, sdp: peer.localDescription };

    try {
        // Ensure you are hitting the correct endpoint for the file
        // For viewer.js use: axios.post('/consumer', ...
        // For stream.js use: axios.post('/broadcast', ...
        const { data } = await axios.post(endpoint, payload);
        const desc = new RTCSessionDescription(data.sdp);
        peer.setRemoteDescription(desc);
    } catch (error) {
        console.error("Error during negotiation:", error);
    }
}

function handleTrackEvent(event) {
    console.log("Track event received: ", event.streams[0]);
    document.getElementById("video").srcObject = event.streams[0];
}

// Developer Harsh - https://developerharsh.com/