const voiceAgentAuth = (req, res, next) => {
    const secret = req.headers['x-voice-agent-secret'];

    if (!secret || secret !== process.env.VOICE_AGENT_SECRET) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    next();
};

module.exports = voiceAgentAuth;
