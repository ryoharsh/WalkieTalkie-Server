require('dotenv').config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const webrtc = require('wrtc');
const app = express();
const path = require('path');

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const streams = new Map();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI).then(() => console.log('Connected to MongoDB'))
    .catch(err => console.log(err));

    const profileSchema = new mongoose.Schema({
        uid: { type: String, required: true },
        token: { type: String, required: true, unique: true },
    });

    const Profile = mongoose.model("Profile", profileSchema);

    app.get("/", (req, res) => res.send("app backend"));

    app.post("/profiles/save", async (req, res) => {
        const { uid, token } = req.body;
    
        if (!uid || !token) {
            return res.status(400).json({ error: "All fields are required" });
        }
    
        try {    
            const newProfile = new Profile({
                uid,
                token,
            });
    
            await newProfile.save();
            res.status(201).json({ message: "Profile created successfully" });
        } catch (err) {
            console.error("Error saving profile:", err);
            res.status(500).json({ error: "Server error" });
        }        
    });
    
    app.get("/profiles/:uid", async (req, res) => {
        const { uid } = req.params;
    
        try {
            const profile = await Profile.findOne({ uid });
            
            if (!profile) {
                return res.status(404).json({ error: "Profile not found" });
            }
    
            res.status(200).json(profile);
        } catch (err) {
            console.error("Error fetching profile:", err.message);
            res.status(500).json({ error: "Failed to fetch profile" });
        }
    });

    app.patch("/profiles/:uid", async (req, res) => {
        const { uid } = req.params;
        const updateData = req.body;
    
        try {
            const updatedProfile = await Profile.findOneAndUpdate(
                { uid },
                { $set: updateData },
                { new: true, runValidators: true }
            );
    
            if (!updatedProfile) {
                return res.status(404).json({ error: "Profile not found" });
            }
    
            res.status(200).json({ message: "Profile updated successfully", updatedProfile });
        } catch (err) {
            res.status(500).json({ error: "Server error" });
        }
    });

    function waitForIce(peer) {
        return new Promise(resolve => {
            if (peer.iceGatheringState === 'complete') {
                resolve();
                return;
            }

            const checkState = () => {
                if (peer.iceGatheringState === 'complete') {
                    peer.removeEventListener('icegatheringstatechange', checkState);
                    resolve();
                }
            };

            peer.addEventListener('icegatheringstatechange', checkState);

            // SOLUTION: 2000ms (2 second) ka timeout lagaya hai.
            // Agar 2 second me gathering complete nahi hui, toh force resolve kar denge.
            // Isse stream 10s ki jagah max 2s me start ho jayegi.
            setTimeout(() => {
                peer.removeEventListener('icegatheringstatechange', checkState);
                resolve();
            }, 2000);
        });
    }

//    const waitForIce = (peer) => {
//        return new Promise((resolve) => {
//            if (peer.iceGatheringState === 'complete') {
//                resolve();
//            } else {
//                const checkState = () => {
//                    if (peer.iceGatheringState === 'complete') {
//                        peer.removeEventListener('icegatheringstatechange', checkState);
//                        resolve();
//                    }
//                };
//                peer.addEventListener('icegatheringstatechange', checkState);
//            }
//        });
//    };

    app.post('/broadcast', async (req, res) => {
        const { streamId, sdp } = req.body;
        console.log('Broadcast received with streamId:', streamId);
    
        if (!streamId) {
            console.error("Stream ID is missing");
            return res.status(400).send("Stream ID is required");
        }
    
        const peer = new webrtc.RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.stunprotocol.org" }]
        });
    
        peer.ontrack = (e) => {
            streams.set(streamId, e.streams[0]);
            console.log('Track received for streamId:', streamId);
        };
    
        const desc = new webrtc.RTCSessionDescription(sdp);
    
        try {
            await peer.setRemoteDescription(desc);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);

            await waitForIce(peer);
    
            res.json({ sdp: peer.localDescription });
        } catch (err) {
            console.error("Error in /broadcast:", err);
            res.status(500).send("Failed to handle broadcast");
        }
    });
    
    app.post('/consumer', async (req, res) => {
        const { streamId, sdp } = req.body;
        console.log('Consumer requested streamId:', streamId);
    
        if (!streams.has(streamId)) {
            console.error("Stream ID not found:", streamId);
            return res.status(404).send("Stream not found");
        }
    
        const peer = new webrtc.RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.stunprotocol.org" }]
        });
    
        const stream = streams.get(streamId);
        stream.getTracks().forEach(track => peer.addTrack(track, stream));

        console.log("Retrieved stream for streamId:", streamId);
    
        const desc = new webrtc.RTCSessionDescription(sdp);
    
        try {
            await peer.setRemoteDescription(desc);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);

            await waitForIce(peer);
    
            res.json({ sdp: peer.localDescription });
        } catch (err) {
            console.error("Error in /consumer:", err);
            res.status(500).send("Failed to handle consumer");
        }
    });
    
    app.get('/streams', (req, res) => {
        res.json({ activeStreams: Array.from(streams.keys()) });
    });
    
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));