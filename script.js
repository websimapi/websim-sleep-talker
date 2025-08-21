document.addEventListener('DOMContentLoaded', () => {
    const toggleListeningBtn = document.getElementById('toggle-listening-btn');
    const aiTalkBackToggle = document.getElementById('ai-talk-back-toggle');
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    const logContainer = document.getElementById('log');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;

    if (!SpeechRecognition) {
        updateStatus('error', 'Speech Recognition API not supported in this browser.');
        toggleListeningBtn.disabled = true;
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    let isListening = false;
    let conversationHistory = [];
    let audioQueue = [];
    let isPlaying = false;

    const updateStatus = (status, text) => {
        statusIndicator.className = status;
        statusText.textContent = text;
    };

    const addLogEntry = (speaker, text) => {
        const entry = document.createElement('div');
        entry.classList.add('log-entry', speaker);
        entry.textContent = text;
        logContainer.appendChild(entry);
        logContainer.scrollTop = logContainer.scrollHeight;
    };

    toggleListeningBtn.addEventListener('click', () => {
        isListening = !isListening;
        if (isListening) {
            toggleListeningBtn.textContent = 'Stop Listening';
            toggleListeningBtn.classList.add('listening');
            try {
                recognition.start();
                updateStatus('listening', 'Listening...');
            } catch (e) {
                console.error("Recognition already started.", e);
            }
        } else {
            toggleListeningBtn.textContent = 'Start Listening';
            toggleListeningBtn.classList.remove('listening');
            recognition.stop();
            updateStatus('idle', 'Idle');
        }
    });

    recognition.onstart = () => {
        if (isListening) updateStatus('listening', 'Listening...');
    };

    recognition.onresult = async (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.trim();
        if (transcript) {
            addLogEntry('user', `YOU (asleep): "${transcript}"`);
            await processUserSpeech(transcript);
        }
    };

    recognition.onend = () => {
        if (isListening) {
            // Restart recognition if it stops unexpectedly
            recognition.start();
        } else {
            updateStatus('idle', 'Idle');
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if(event.error === 'no-speech'){
            // This is a common case, just keep listening
        } else {
            updateStatus('error', `Error: ${event.error}`);
            isListening = false;
            toggleListeningBtn.textContent = 'Start Listening';
            toggleListeningBtn.classList.remove('listening');
        }
    };

    const processUserSpeech = async (transcript) => {
        updateStatus('processing', 'AI is thinking...');
        
        conversationHistory.push({ role: 'user', content: transcript });
        // Keep history short to save tokens
        conversationHistory = conversationHistory.slice(-6); 

        const isTalkBackMode = aiTalkBackToggle.checked;
        const systemMessage = isTalkBackMode 
            ? "You are a dream entity conversing with a sleeping person. Your responses should be brief, dreamlike, and slightly mysterious to not fully wake them. Respond directly to what they said."
            : "You are a dream interpreter. The user is talking in their sleep. Analyze their utterance and generate a 'superprompt' for an image generator that captures the essence of their dream. The superprompt should be vivid, detailed, and surreal. Respond with only the superprompt and nothing else.";

        try {
            const completion = await websim.chat.completions.create({
                messages: [
                    { role: 'system', content: systemMessage },
                    ...conversationHistory
                ],
            });

            const aiResponse = completion.content;
            const logMessage = isTalkBackMode ? `AI: "${aiResponse}"` : `AI Superprompt: "${aiResponse}"`;
            addLogEntry('ai', logMessage);
            conversationHistory.push({ role: 'assistant', content: aiResponse });

            if (isTalkBackMode) {
                const ttsResult = await websim.textToSpeech({ text: aiResponse, voice: "en-female" });
                audioQueue.push(new Audio(ttsResult.url));
                playNextInQueue();
            } else {
                 if (isListening) updateStatus('listening', 'Listening...');
                 else updateStatus('idle', 'Idle');
            }

        } catch (error) {
            console.error('Error with AI completion:', error);
            addLogEntry('system', 'Error: Could not get a response from the AI.');
             if (isListening) updateStatus('listening', 'Listening...');
             else updateStatus('idle', 'Idle');
        }
    };

    const playNextInQueue = () => {
        if (isPlaying || audioQueue.length === 0) {
            return;
        }

        isPlaying = true;
        const audio = audioQueue.shift();

        recognition.stop(); // Stop listening while AI speaks
        updateStatus('speaking', 'AI is speaking...');

        audio.play();
        audio.onended = () => {
            isPlaying = false;
            if (isListening) {
                recognition.start();
                updateStatus('listening', 'Listening...');
            } else {
                updateStatus('idle', 'Idle');
            }
            playNextInQueue(); // Check if there's more in the queue
        };
    };
});

