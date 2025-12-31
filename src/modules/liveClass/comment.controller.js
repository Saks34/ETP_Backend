const { Comment } = require('./comment.model');
const { LiveClass } = require('./liveclass.model');

async function addComment(req, res) {
    try {
        const { liveClassId, text } = req.body;
        const userId = req.user.sub;
        const institutionId = req.user.institutionId;

        if (!liveClassId || !text) {
            return res.status(400).json({ message: 'LiveClass ID and text are required' });
        }

        const live = await LiveClass.findById(liveClassId);
        if (!live) return res.status(404).json({ message: 'LiveClass not found' });

        // Scope check
        if (String(live.institutionId) !== String(institutionId) && req.user.role !== 'SuperAdmin') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const comment = await Comment.create({
            institutionId,
            liveClassId,
            user: userId,
            text
        });

        const populated = await Comment.findById(comment._id).populate('user', 'name role');

        return res.status(201).json(populated);
    } catch (err) {
        console.error('addComment error:', err);
        return res.status(500).json({ message: 'Failed to add comment' });
    }
}

async function getComments(req, res) {
    try {
        const { liveClassId } = req.query;
        if (!liveClassId) return res.status(400).json({ message: 'LiveClass ID required' });

        // We can add institution check here too if needed, but usually listing comments for a valid liveClassId implies access if the user can see the class.
        // However, rigorous check:
        const live = await LiveClass.findById(liveClassId);
        if (!live) return res.status(404).json({ message: 'LiveClass not found' });

        if (req.user.role !== 'SuperAdmin' && req.user.institutionId && String(live.institutionId) !== String(req.user.institutionId)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const comments = await Comment.find({ liveClassId, isDeleted: false })
            .sort({ createdAt: -1 }) // Newest first
            .populate('user', 'name role');

        return res.status(200).json({ comments });
    } catch (err) {
        console.error('getComments error:', err);
        return res.status(500).json({ message: 'Failed to fetch comments' });
    }
}

async function deleteComment(req, res) {
    try {
        const { id } = req.params;
        const userId = req.user.sub;

        const comment = await Comment.findById(id);
        if (!comment) return res.status(404).json({ message: 'Comment not found' });

        // Allow deletion if: User is author OR User is Teacher (of that inst) or Admin
        const isAuthor = String(comment.user) === String(userId);
        const isAdmin = ['InstitutionAdmin', 'SuperAdmin', 'AcademicAdmin', 'Moderator', 'Teacher'].includes(req.user.role);

        if (!isAuthor && !isAdmin) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        comment.isDeleted = true;
        comment.deletedBy = userId;
        await comment.save();

        return res.status(200).json({ message: 'Comment deleted' });
    } catch (err) {
        console.error('deleteComment error:', err);
        return res.status(500).json({ message: 'Failed to delete comment' });
    }
}

module.exports = { addComment, getComments, deleteComment };
