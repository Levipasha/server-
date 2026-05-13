const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
const User = require('../models/User');
const ArtistProfile = require('../models/ArtistProfile');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/messages  — messages for the currently logged-in user
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const myId = req.user.userId;
    console.log(`\n[MSG_DEBUG] Fetching messages for identity: ${myId}`);

    // --- ROBUST CONSOLIDATED IDENTITY ---
    // Start with the current ID
    let myIds = [new mongoose.Types.ObjectId(myId)];
    
    // Try to find the user/artist record to get the email
    let me = await User.findById(myId).lean();
    if (!me) me = await ArtistProfile.findById(myId).lean();

    if (me && me.email) {
      console.log(`[MSG_DEBUG] Found email: ${me.email}`);
      const [altUser, altArtist] = await Promise.all([
        User.findOne({ email: me.email.toLowerCase() }).lean(),
        ArtistProfile.findOne({ email: me.email.toLowerCase() }).lean()
      ]);
      
      if (altUser && !myIds.some(id => id.toString() === altUser._id.toString())) {
        myIds.push(altUser._id);
      }
      if (altArtist && !myIds.some(id => id.toString() === altArtist._id.toString())) {
        myIds.push(altArtist._id);
      }
    }

    console.log(`[MSG_DEBUG] Consolidated IDs: [${myIds.join(', ')}]`);

    const query = {
      $or: [
        { sender: { $in: myIds } },
        { recipient: { $in: myIds } }
      ]
    };
    
    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .populate('sender', 'displayName photoURL name image email')
      .populate('recipient', 'displayName photoURL name image email');

    console.log(`[MSG_DEBUG] Query results: ${messages.length} messages found\n`);
    res.json(messages);
  } catch (error) {
    console.error('[MSG_ERROR] Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/messages/conversations  — grouped conversation list for the user
// ──────────────────────────────────────────────────────────────────────────────
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const myId = req.user.userId;
    console.log(`\n[CONV_DEBUG] Grouping inbox for: ${myId}`);

    // 1. Get ALL my identities
    let myIds = [new mongoose.Types.ObjectId(myId)];
    let me = await User.findById(myId).lean();
    if (!me) me = await ArtistProfile.findById(myId).lean();
    
    if (me && me.email) {
      const [altUser, altArtist] = await Promise.all([
        User.findOne({ email: me.email.toLowerCase() }).lean(),
        ArtistProfile.findOne({ email: me.email.toLowerCase() }).lean()
      ]);
      if (altUser && !myIds.some(id => id.toString() === altUser._id.toString())) myIds.push(altUser._id);
      if (altArtist && !myIds.some(id => id.toString() === altArtist._id.toString())) myIds.push(altArtist._id);
    }

    const myIdsStr = myIds.map(id => id.toString());

    // 2. Fetch all messages
    const messages = await Message.find({
      $or: [{ sender: { $in: myIds } }, { recipient: { $in: myIds } }]
    })
      .sort({ createdAt: -1 })
      .populate('sender', 'displayName photoURL name image email')
      .populate('recipient', 'displayName photoURL name image email');

    // 3. Group by partner identity (Email preferred)
    const convMap = new Map();

    messages.forEach(msg => {
      const sId = msg.sender?._id?.toString();
      const rId = msg.recipient?._id?.toString();
      const sEmail = msg.sender?.email?.toLowerCase();
      const rEmail = msg.recipient?.email?.toLowerCase();

      if (!sId || !rId) return;

      const isMeSender = myIdsStr.includes(sId);
      const partner = isMeSender ? msg.recipient : msg.sender;
      const partnerEmail = isMeSender ? rEmail : sEmail;
      const partnerId = isMeSender ? rId : sId;

      if (!partner) return;

      // Grouping Key: Priority 1: Partner Email, Priority 2: Partner ID
      const groupKey = partnerEmail || partnerId;

      if (!convMap.has(groupKey)) {
        convMap.set(groupKey, {
          partner: typeof partner === 'object' ? partner : { _id: partnerId, email: partnerEmail },
          lastMessage: msg,
          unreadCount: 0
        });
      }

      // Increment unread if message is TO me and not read
      if (msg.status !== 'read' && !isMeSender && myIdsStr.includes(rId)) {
        convMap.get(groupKey).unreadCount++;
      }
    });

    const result = Array.from(convMap.values());
    console.log(`[CONV_DEBUG] Consolidated into ${result.length} inbox rows\n`);
    res.json(result);
  } catch (error) {
    console.error('[CONV_ERROR]', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/messages/for-artist/:artistId
//   Artist dashboard inbox — fetch all messages sent to a given ArtistProfile.
//   No user auth required (artist uses their own JWT from the artist dashboard).
// ──────────────────────────────────────────────────────────────────────────────
router.get('/for-artist/:artistId', async (req, res) => {
  try {
    const { artistId } = req.params;
    console.log(`[DEBUG] Fetching inbox for artistId: ${artistId}`);

    // Basic security: check token if provided
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // If it's an artist token, they can only see their own inbox
        if (decoded.artistId && decoded.artistId.toString() !== artistId.toString()) {
          return res.status(403).json({ error: 'Not authorized to view this inbox' });
        }
      } catch (err) {
        // Token invalid; in production we might block this, but for now we'll allow if it's a dev environment
        if (process.env.NODE_ENV === 'production') {
           return res.status(401).json({ error: 'Invalid token' });
        }
      }
    }

    // Fetch messages where the artist is either the sender OR the recipient
    const messages = await Message.find({
      $or: [
        { recipient: artistId },
        { sender: artistId }
      ]
    })
      .sort({ createdAt: -1 })
      .populate('sender', 'displayName photoURL email name image')
      .populate('recipient', 'displayName photoURL email name image');

    console.log(`[DEBUG] Found ${messages.length} messages for artist ${artistId}`);
    res.json(messages);
  } catch (error) {
    console.error('Get artist messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/messages  — send a new message (Polymorphic & Real-time)
// ──────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { recipientId, text } = req.body;
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) return res.status(401).json({ error: 'No token provided' });
    if (!recipientId || !text) return res.status(400).json({ error: 'Recipient and text are required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const myId = decoded.userId || decoded.id || decoded.artistId;
    
    // Determine sender model
    const senderModel = decoded.artistId ? 'ArtistProfile' : 'User';
    const senderType = decoded.artistId ? 'artist' : (decoded.role || 'user');

    // Determine recipient model
    let recipientModel = 'User';
    let recipientType = 'user';

    const recipientAsUser = await User.findById(recipientId).catch(() => null);
    if (recipientAsUser) {
      recipientType = recipientAsUser.role === 'artist' ? 'artist' : 'user';
    } else {
      const recipientAsArtist = await ArtistProfile.findById(recipientId).catch(() => null);
      if (!recipientAsArtist) {
        return res.status(404).json({ error: 'Recipient not found' });
      }
      recipientModel = 'ArtistProfile';
      recipientType = 'artist';
    }

    // Save to database
    const newMessage = new Message({
      sender: myId,
      senderModel,
      recipient: recipientId,
      recipientModel,
      text: text.trim(),
      senderType,
      recipientType,
      status: 'sent'
    });

    await newMessage.save();

    const populated = await Message.findById(newMessage._id)
      .populate('sender')
      .populate('recipient');

    // Real-time broadcast via Socket.io
    try {
      const { getIO } = require('../services/socketService');
      const io = getIO();
      
      // Robust Room Naming: Use Emails if available, otherwise fallback to IDs
      const senderEmail = populated.sender?.email;
      const recipientEmail = populated.recipient?.email;
      
      let conversationId;
      if (senderEmail && recipientEmail) {
        conversationId = [senderEmail.toLowerCase(), recipientEmail.toLowerCase()].sort().join('_');
      } else {
        conversationId = [myId.toString(), recipientId.toString()].sort().join('_');
      }
      
      console.log(`[DEBUG] Emitting to room: ${conversationId}`);
      io.to(conversationId).emit('receive_message', populated);
      
      // Also emit to individual user rooms for inbox updates
      if (populated.recipient?._id) {
        io.to(`user_${populated.recipient._id}`).emit('new_message_notification', populated);
      }
      if (populated.sender?._id) {
        io.to(`user_${populated.sender._id}`).emit('new_message_notification', populated);
      }

    } catch (socketErr) {
      console.warn('Socket emit failed, but message was saved to DB:', socketErr.message);
    }

    res.status(201).json(populated);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/messages/conversation/:partnerId  — full history with a partner
// ──────────────────────────────────────────────────────────────────────────────
router.get('/conversation/:partnerId', async (req, res) => {
  try {
    const { partnerId } = req.params;
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret';
    console.log(`[DEBUG] JWT Secret: ${jwtSecret}`);
    console.log(`[DEBUG] Received token: ${token}`);
    
    const decoded = jwt.verify(token, jwtSecret);
    console.log(`[DEBUG] Decoded token:`, decoded);
    const myId = decoded.userId || decoded.id || decoded.artistId;
    
    if (!myId) {
      return res.status(401).json({ error: 'Invalid token - no user ID found' });
    }
    
    console.log(`\n[HISTORY_FETCH] Between ${myId} and ${partnerId}`);
    
    // --- CONSOLIDATED IDENTITY FOR BOTH SIDES ---
    const getIdentities = async (id) => {
      let ids = [new mongoose.Types.ObjectId(id)];
      let record = await User.findById(id).lean();
      if (!record) record = await ArtistProfile.findById(id).lean();
      
      if (record && record.email) {
        const [altU, altA] = await Promise.all([
          User.findOne({ email: record.email.toLowerCase() }).lean(),
          ArtistProfile.findOne({ email: record.email.toLowerCase() }).lean()
        ]);
        if (altU && !ids.some(i => i.toString() === altU._id.toString())) ids.push(altU._id);
        if (altA && !ids.some(i => i.toString() === altA._id.toString())) ids.push(altA._id);
      }
      return ids;
    };

    const [myIds, partnerIds] = await Promise.all([
      getIdentities(myId),
      getIdentities(partnerId)
    ]);

    console.log(`[HISTORY_DEBUG] My IDs: [${myIds.join(', ')}]`);
    console.log(`[HISTORY_DEBUG] Partner IDs: [${partnerIds.join(', ')}]`);

    const messages = await Message.find({
      $or: [
        { sender: { $in: myIds }, recipient: { $in: partnerIds } },
        { sender: { $in: partnerIds }, recipient: { $in: myIds } }
      ]
    })
    .sort({ createdAt: 1 })
    .populate('sender', 'displayName photoURL name image email')
    .populate('recipient', 'displayName photoURL name image email');

    console.log(`[HISTORY_RESULT] Found ${messages.length} messages\n`);
    if (messages.length > 0) {
      console.log(`[DEBUG] First message:`, JSON.stringify(messages[0], null, 2));
    }
    res.json(messages);
  } catch (error) {
    console.error('[HISTORY_ERROR]', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: 'Failed to fetch conversation history' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
router.patch('/:id/read', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId || decoded.id;
    const artistId = decoded.artistId;

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid message ID format' });
    }

    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ error: 'Message not found' });

    // Authorization: Only the RECIPIENT can mark as read
    const isRecipientUser = userId && message.recipient.toString() === userId.toString();
    const isRecipientArtist = artistId && message.recipient.toString() === artistId.toString();

    if (!isRecipientUser && !isRecipientArtist) {
      return res.status(403).json({ error: 'Not authorized to mark this message as read' });
    }

    message.status = 'read';
    await message.save();

    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to update message' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/messages/:id
// ──────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId || decoded.id;
    const artistId = decoded.artistId;

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid message ID format' });
    }

    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ error: 'Message not found' });

    // Authorization: Only sender or recipient can delete
    const isOwnerUser = userId && (message.sender.toString() === userId.toString() || message.recipient.toString() === userId.toString());
    const isOwnerArtist = artistId && (message.sender.toString() === artistId.toString() || message.recipient.toString() === artistId.toString());

    if (!isOwnerUser && !isOwnerArtist) {
      return res.status(403).json({ error: 'Not authorized to delete this message' });
    }

    await Message.findByIdAndDelete(req.params.id);
    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

module.exports = router;
