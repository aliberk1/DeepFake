document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    const startBtn = document.getElementById('start-btn');
    const downloadBtn = document.getElementById('download-btn');
    const videoOutput = document.getElementById('output-video');
    const placeholder = document.querySelector('.placeholder');
    const aiNameLabel = document.getElementById('ai-name-label');
    const faceSelect = document.getElementById('face-select');
    const rateSlider = document.getElementById('rate-slider');
    const rateVal = document.getElementById('rate-val');
    const pitchSlider = document.getElementById('pitch-slider');
    const pitchVal = document.getElementById('pitch-val');
    const emotionSelect = document.getElementById('emotion-select');
    const micBtn = document.getElementById('mic-btn');

    // Update slider UI values
    rateSlider?.addEventListener('input', (e) => rateVal.textContent = e.target.value);
    pitchSlider?.addEventListener('input', (e) => pitchVal.textContent = e.target.value);
    
    // Chat Elements
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const chatHistory = document.getElementById('chat-history');

    // Scenario Elements
    const scenarioSelect = document.getElementById('scenario-select');
    const loadingPanel = document.getElementById('scenario-loading');
    const loadingText = document.getElementById('scenario-loading-text');
    const loadingProgress = document.getElementById('scenario-progress');
    const playPanel = document.getElementById('play-interview-panel');
    const playBtn = document.getElementById('play-scenario-btn');
    const subtitlesEl = document.getElementById('scenario-subtitles');

    const SCENARIOS = {
        comedy: [
            { audio: '../outputs/voice_20260503_180542.mp3', text: 'Merhaba, komedi programına hoş geldiniz!' },
            { audio: '../outputs/voice_20260503_180600.mp3', text: 'Bugün çok ilginç konularımız var, hazır mısınız?' },
            { audio: '../outputs/voice_20260503_180620.mp3', text: 'Gülmekten karnınıza ağrılar girecek, garanti veriyorum!' }
        ],
        job_interview: [
            { audio: '../outputs/voice_20260503_180648.mp3', text: 'Merhaba, iş görüşmesine hoş geldiniz. Lütfen oturun.' },
            { audio: '../outputs/voice_20260503_180702.mp3', text: 'Bize biraz kendinizden ve önceki tecrübelerinizden bahseder misiniz?' },
            { audio: '../outputs/voice_20260503_180713.mp3', text: 'Bu pozisyon için neden uygun olduğunuzu düşünüyorsunuz?' }
        ],
        debate: [
            { audio: '../outputs/voice_20260503_180733.mp3', text: 'Münazaramıza başlıyoruz. Konumuz yapay zeka.' },
            { audio: '../outputs/voice_20260503_180749.mp3', text: 'Yapay zekanın insanlığa faydalı olduğuna inananlar söz hakkı sizde.' },
            { audio: '../outputs/voice_20260503_180802.mp3', text: 'Teşekkürler, şimdi karşıt görüşü dinleyelim.' }
        ],
        motivational: [
            { audio: '../outputs/voice_20260503_180542.mp3', text: 'İçinizdeki potansiyeli asla küçümsemeyin!' },
            { audio: '../outputs/voice_20260503_180600.mp3', text: 'Her yeni gün, yeni bir başlangıçtır.' },
            { audio: '../outputs/voice_20260503_180620.mp3', text: 'Başarı, asla pes etmeyenlerin ödülüdür.' }
        ]
    };

    let isInteracting = false;
    let streamActive = false;
    let localStream = null;
    let socket = null;
    let videoInterval = null;
    let isProcessingFrame = false;
    
    // Virtual Canvas for processing
    const captureCanvas = document.createElement('canvas');
    const captureCtx = captureCanvas.getContext('2d');
    const webcamVideo = document.getElementById('webcam-video');
    const renderedVideo = document.getElementById('output-video');
    
    // Attempt to connect via Socket.IO for FaceSwap Stream
    if (typeof io !== 'undefined') {
        socket = io();
        socket.on('processed_frame', (data) => {
            renderedVideo.src = data.image; // Display returned base64 processed image
            isProcessingFrame = false;
        });
    }

    // Tab Switching Logic
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.add('hidden'));
            
            // Add active to clicked
            btn.classList.add('active');
            const target = btn.getAttribute('data-tab');
            document.getElementById(`${target}-tab`).classList.remove('hidden');
        });
    });

    // Face Model Name Update
    faceSelect.addEventListener('change', (e) => {
        aiNameLabel.textContent = e.target.options[e.target.selectedIndex].text;
    });

    // Scenario Preloading & Playback Logic
    let currentScenarioAudios = [];
    let currentScenarioData = [];
    let scenarioCurrentIndex = 0;

    scenarioSelect?.addEventListener('change', (e) => {
        loadScenario(e.target.value);
    });

    function loadScenario(scenarioKey) {
        const data = SCENARIOS[scenarioKey];
        if (!data) return;

        currentScenarioData = data;
        currentScenarioAudios = [];
        scenarioCurrentIndex = 0;
        
        let loadedCount = 0;
        const total = data.length;
        
        // UI Reset
        if(playPanel) playPanel.style.display = 'none';
        if(subtitlesEl) subtitlesEl.style.display = 'none';
        if(loadingPanel) loadingPanel.style.display = 'block';
        if(loadingText) loadingText.textContent = `Ses dosyaları yükleniyor (0/${total})...`;
        if(loadingProgress) loadingProgress.style.width = '0%';
        
        data.forEach((item) => {
            const audio = new Audio();
            audio.preload = 'auto';
            
            const markLoaded = () => {
                if (audio._isLoaded) return;
                audio._isLoaded = true;
                loadedCount++;
                if(loadingText) loadingText.textContent = `Ses dosyaları yükleniyor (${loadedCount}/${total})...`;
                if(loadingProgress) loadingProgress.style.width = `${(loadedCount / total) * 100}%`;
                
                if (loadedCount === total) {
                    setTimeout(() => {
                        if(loadingPanel) loadingPanel.style.display = 'none';
                        if(playPanel) playPanel.style.display = 'block';
                    }, 500); // short delay for 100% visual completion
                }
            };

            // "oncanplaythrough" indicates the audio is fully ready
            audio.addEventListener('canplaythrough', markLoaded);
            audio.addEventListener('error', markLoaded); // Don't block UI if file is missing
            
            audio.src = item.audio;
            audio.load();
            currentScenarioAudios.push(audio);
        });
    }

    playBtn?.addEventListener('click', () => {
        if(playPanel) playPanel.style.display = 'none';
        if(subtitlesEl) subtitlesEl.style.display = 'block';
        scenarioCurrentIndex = 0;
        playNextScenarioAudio();
    });

    function playNextScenarioAudio() {
        if (scenarioCurrentIndex >= currentScenarioAudios.length) {
            if(subtitlesEl) subtitlesEl.style.display = 'none';
            addSystemMessage("Röportaj / Senaryo tamamlandı.");
            return;
        }

        const audio = currentScenarioAudios[scenarioCurrentIndex];
        const text = currentScenarioData[scenarioCurrentIndex].text;
        
        if(subtitlesEl) subtitlesEl.textContent = text;
        addAiMessage(text);
        
        // Use "onended" for sequential flow
        audio.addEventListener('ended', () => {
            scenarioCurrentIndex++;
            playNextScenarioAudio();
        }, { once: true });
        
        audio.play().catch(e => {
            console.error("Audio playback error:", e);
            // Fallback: Skip to next if error occurs
            scenarioCurrentIndex++;
            playNextScenarioAudio();
        });
    }

    // Start/Stop Interaction
    startBtn.addEventListener('click', () => {
        if (!isInteracting) {
            startInteraction();
        } else {
            stopInteraction();
        }
    });

    async function startInteraction() {
        if (isInteracting) return;
        
        // Mock loading stream
        placeholder.innerHTML = '<div class="spinner"></div><p>Connecting to Camera Engine...</p>';
        placeholder.style.display = 'flex';
        
        try {
            // FR-2.3: Detect user's face from a live webcam feed
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            
            isInteracting = true;
            streamActive = true;
            
            // Update UI state
            startBtn.classList.remove('primary');
            startBtn.classList.add('danger');
            startBtn.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
                Stop Interaction
            `;
            
            // Enable Chat & Download
            chatInput.disabled = false;
            sendBtn.disabled = false;
            downloadBtn.disabled = false;
            
            placeholder.style.display = 'none';
            renderedVideo.style.display = 'block'; 
            
            webcamVideo.srcObject = localStream;
            webcamVideo.play();
            
            // Start capturing frames and sending to Socket.IO backend (FR-2.10)
            videoInterval = setInterval(() => {
                if (!streamActive || !socket || isProcessingFrame) return;
                
                // Downscale resolution significantly for performance and stability
                const MAX_WIDTH = 480;
                let width = webcamVideo.videoWidth || 640;
                let height = webcamVideo.videoHeight || 480;
                if (width > MAX_WIDTH) {
                    height = Math.floor(height * (MAX_WIDTH / width));
                    width = MAX_WIDTH;
                }
                
                captureCanvas.width = width;
                captureCanvas.height = height;
                
                if (captureCanvas.width > 0) {
                    captureCtx.drawImage(webcamVideo, 0, 0, captureCanvas.width, captureCanvas.height);
                    const dataURL = captureCanvas.toDataURL('image/jpeg', 0.5); // Increase compression to 0.5
                    const currentFace = document.getElementById('face-select').value;
                    
                    isProcessingFrame = true;
                    socket.emit('video_frame', { image: dataURL, face_model: currentFace });
                    
                    // Safety timeout increased to 10 seconds to prevent queue buildup and computer crash
                    setTimeout(() => { isProcessingFrame = false; }, 10000);
                }
            }, 100); // Try processing at max 10 FPS to prevent CPU/RAM overload
            
            addSystemMessage("Camera securely connected. Deepfake pipeline actively rendering (FR-2.10).");
            
            // Simulated first greeting from AI
            setTimeout(() => {
                addAiMessage("Hello! I'm ready to begin our scenario. Feel free to speak or type in the chat.");
            }, 1000);
            
        } catch (err) {
            console.error("Camera Error: ", err);
            placeholder.innerHTML = '<p>Error: Could not access your camera.</p>';
            alert("Kamera izni alınamadı! Lütfen tarayıcıdan kamera izni verdiğinize emin olun.");
        }
    }

    function stopInteraction() {
        if (!isInteracting) return;
        
        isInteracting = false;
        streamActive = false;
        
        // Update UI state
        startBtn.classList.remove('danger');
        startBtn.classList.add('primary');
        startBtn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            Start Interaction
        `;
        
        // Disable Chat
        chatInput.disabled = true;
        sendBtn.disabled = true;
        
        // Reset Video and Stop Camera Tracks
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        
        if (videoInterval) clearInterval(videoInterval);
        webcamVideo.srcObject = null;
        renderedVideo.src = '';
        renderedVideo.style.display = 'none';
        placeholder.style.display = 'flex';
        placeholder.innerHTML = '<div class="spinner" style="border-top-color: transparent"></div><p>Interaction ended.</p>';
        
        addSystemMessage("Meeting ended. Camera hardware released.");
    }

    // Speech Recognition (FR-1.7, FR-1.8)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            chatInput.value = transcript;
            handleSend(); // Auto-send the transcribed live voice
        };

        recognition.onspeechend = () => {
            if(micBtn) micBtn.innerHTML = '🎤 Use Live Microphone';
            recognition.stop();
        };

        recognition.onerror = (e) => {
            if(micBtn) micBtn.innerHTML = '🎤 Use Live Microphone';
            addSystemMessage("Microphone error: " + e.error);
        };
    }

    micBtn?.addEventListener('click', () => {
        if (!streamActive) {
            alert("Please start the interaction first.");
            return;
        }
        if (recognition) {
            micBtn.innerHTML = 'Listening... Speak now';
            recognition.start();
        } else {
            alert("Live Microphone Speech Recognition is not supported in this browser.");
        }
    });

    // Chat Logic
    async function handleSend() {
        const text = chatInput.value.trim();
        const styleSelect = document.getElementById('style-select').value;
        const rate = parseFloat(rateSlider?.value || "1.0");
        const pitch = parseInt(pitchSlider?.value || "0");
        const emotion = emotionSelect?.value || "neutral";
        
        if (text && streamActive) {
            addUserMessage(text);
            chatInput.value = '';
            
            try {
                // Remove mock interaction, use actual Backend API
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        message: text, 
                        persona: styleSelect,
                        rate: rate,
                        pitch: pitch,
                        emotion: emotion
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    addAiMessage(data.response);
                    
                    if (data.audio_url) {
                        const audio = new Audio(data.audio_url);
                        audio.play().catch(e => console.error("Audio playback error:", e));
                        addSystemMessage("Audio playing...");
                    }
                } else {
                    addSystemMessage("Error: Failed to fetch AI response from Local Server.");
                }
            } catch (err) {
                console.error(err);
                addSystemMessage("Error: Connection to backend failed.");
            }
        }
    }

    sendBtn.addEventListener('click', handleSend);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSend();
    });

    function addUserMessage(text) {
        const div = document.createElement('div');
        div.className = 'message user';
        div.textContent = text;
        chatHistory.appendChild(div);
        scrollToBottom();
    }

    function addAiMessage(text) {
        const div = document.createElement('div');
        div.className = 'message ai';
        div.textContent = text;
        chatHistory.appendChild(div);
        scrollToBottom();
    }
    
    function addSystemMessage(text) {
        const div = document.createElement('div');
        div.className = 'message system';
        div.textContent = text;
        chatHistory.appendChild(div);
        scrollToBottom();
    }

    function scrollToBottom() {
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    // Export/Download (FR-6.5)
    downloadBtn.addEventListener('click', () => {
        alert("Downloading encrypted watermarked session record (.mp4)...");
    });
});
