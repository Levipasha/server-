const express = require('express');
const router = express.Router();
const ArtistProfile = require('../models/ArtistProfile');
const Event = require('../models/Event');
const Product = require('../models/Product');

// POST /api/chatbot/chat - Chat with the AI assistant
router.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get system prompt from environment
    const systemPrompt = process.env.ARTIST_CHATBOT_PROMPT;
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;

    if (!openrouterApiKey || openrouterApiKey === 'your-openrouter-api-key-here') {
      return res.status(500).json({
        error: 'OpenRouter API key not configured',
        message: 'Please configure OPENROUTER_API_KEY in server/.env'
      });
    }

    // Fetch relevant data from database based on message content
    const lowerMessage = message.toLowerCase();
    let contextData = {
      artists: [],
      events: [],
      artworks: []
    };

    // Smart filtering based on user query
    if (lowerMessage.includes('artist') || lowerMessage.includes('artiste')) {
      // Fetch artists
      const artists = await ArtistProfile.find({ isActive: true })
        .select('name artForm bio location social isActive')
        .limit(10);
      console.log(`Found ${artists.length} artists`);
      contextData.artists = artists.map(artist => ({
        name: artist.name,
        artForm: artist.artForm,
        bio: artist.bio,
        location: artist.location
      }));
    }

    if (lowerMessage.includes('event') || lowerMessage.includes('exhibition') || lowerMessage.includes('workshop')) {
      // Fetch upcoming events (include past events if no upcoming ones)
      let events = await Event.find({ 
        status: 'published',
        'date.start': { $gte: new Date() }
      })
      .select('title description category date location pricing status')
      .sort({ 'date.start': 1 })
      .limit(10);

      console.log(`Found ${events.length} upcoming events`);

      // If no upcoming events, fetch recent events
      if (events.length === 0) {
        events = await Event.find({ 
          status: 'published'
        })
        .select('title description category date location pricing status')
        .sort({ 'date.start': -1 })
        .limit(10);
        console.log(`Found ${events.length} recent events (no upcoming)`);
      }

      contextData.events = events.map(event => ({
        title: event.title,
        description: event.description,
        category: event.category,
        date: event.date,
        location: event.location,
        pricing: event.pricing
      }));
    }

    if (lowerMessage.includes('artwork') || lowerMessage.includes('product') || lowerMessage.includes('painting') || lowerMessage.includes('sculpture')) {
      // Fetch available artworks
      const artworks = await Product.find({ 
        status: 'available',
        isActive: true
      })
      .select('name description category price artistName images status')
      .limit(10);
      console.log(`Found ${artworks.length} artworks before filtering`);
      contextData.artworks = artworks
        .filter(art => art.name && art.name.length > 0 && art.name !== '6/-=9-=809-u7y80t') // Filter out artworks with empty/corrupted names
        .map(art => ({
          name: art.name,
          description: art.description,
          category: art.category,
          price: art.price,
          artistName: art.artistName,
          status: art.status
        }));
      console.log(`Found ${contextData.artworks.length} artworks after filtering`);
    }

    // If no specific keywords, fetch limited data for general context
    if (contextData.artists.length === 0 && contextData.events.length === 0 && contextData.artworks.length === 0) {
      console.log('No specific keywords found, fetching general context');
      const [artists, events, artworks] = await Promise.all([
        ArtistProfile.find({ isActive: true }).select('name artForm bio location').limit(5),
        Event.find({ status: 'published' })
          .select('title description category date location pricing')
          .sort({ 'date.start': -1 })
          .limit(5),
        Product.find({ status: 'available', isActive: true })
          .select('name description category price artistName')
          .limit(5)
      ]);

      console.log(`General context: ${artists.length} artists, ${events.length} events, ${artworks.length} artworks`);

      contextData = {
        artists: artists.map(artist => ({
          name: artist.name,
          artForm: artist.artForm,
          bio: artist.bio,
          location: artist.location
        })),
        events: events.map(event => ({
          title: event.title,
          description: event.description,
          category: event.category,
          date: event.date,
          location: event.location,
          pricing: event.pricing
        })),
        artworks: artworks
          .filter(art => art.name && art.name.length > 0 && art.name !== '6/-=9-=809-u7y80t')
          .map(art => ({
            name: art.name,
            description: art.description,
            category: art.category,
            price: art.price,
            artistName: art.artistName
          }))
      };
    }

    // Prepare messages for OpenRouter
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: JSON.stringify(contextData) },
      { role: 'user', content: message }
    ];

    // Call OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openrouterApiKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-OpenRouter-Title': 'ArtArtist'
      },
      body: JSON.stringify({
        model: 'openai/gpt-3.5-turbo',
        messages: messages,
        max_tokens: 500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenRouter API error:', errorData);
      return res.status(500).json({
        error: 'Failed to get response from AI',
        details: errorData.error?.message || 'Unknown error'
      });
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    res.json({ 
      response: aiResponse,
      context: {
        artistsCount: contextData.artists.length,
        eventsCount: contextData.events.length,
        artworksCount: contextData.artworks.length
      }
    });

  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
});

// GET /api/chatbot/health - Check if chatbot is configured
router.get('/health', (req, res) => {
  const hasPrompt = !!process.env.ARTIST_CHATBOT_PROMPT;
  const hasApiKey = process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== 'your-openrouter-api-key-here';

  res.json({
    configured: hasPrompt && hasApiKey,
    hasPrompt,
    hasApiKey,
    message: !hasApiKey ? 'Please configure OPENROUTER_API_KEY in server/.env' : 'Chatbot is ready'
  });
});

module.exports = router;
