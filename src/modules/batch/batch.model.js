const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema({
    institutionId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    academicYear: {
        type: String,
        trim: true,
    },
    subjects: [{
        type: String,
        trim: true,
    }],
    description: {
        type: String,
        trim: true,
    },
    studentCount: {
        type: Number,
        default: 0,
    },
}, {
    timestamps: true,
});

// Compound index for institution + batch name uniqueness
batchSchema.index({ institutionId: 1, name: 1 }, { unique: true });

const Batch = mongoose.model('Batch', batchSchema);

module.exports = { Batch };
