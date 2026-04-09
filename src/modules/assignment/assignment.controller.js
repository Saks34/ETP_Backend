const { Assignment, Submission } = require('./assignment.model');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');
const sendResponse = require('../../utils/response');
const { z } = require('zod');

// Schema for assignment creation
const createAssignmentSchema = z.object({
  batchId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().min(1).refine(val => !isNaN(Date.parse(val)), 'Invalid date'),
  attachmentUrl: z.string().url().optional(),
  attachmentType: z.string().optional(),
});

// Schema for submission
const submissionSchema = z.object({
  fileUrl: z.string().url(),
  fileType: z.string().optional(),
});

const createAssignment = catchAsync(async (req, res, next) => {
  const validated = createAssignmentSchema.parse(req.body);
  const institutionId = req.user.institutionId;

  const assignment = await Assignment.create({
    institutionId,
    batchId: validated.batchId,
    teacherId: req.user.sub || req.user.id,
    title: validated.title,
    description: validated.description,
    dueDate: new Date(validated.dueDate),
    attachmentUrl: validated.attachmentUrl,
    attachmentType: validated.attachmentType,
  });

  return sendResponse(res, 201, assignment, 'Assignment created successfully');
});

const getBatchAssignments = catchAsync(async (req, res, next) => {
  const { batchId } = req.params;
  const institutionId = req.user.institutionId;

  // Verify access (Student checking their own batch, or Admin/Teacher of the institution)
  if (req.user.role === 'Student' && String(req.user.batchId) !== String(batchId)) {
     return next(new AppError('Forbidden: not enrolled in this batch', 403));
  }

  const assignments = await Assignment.find({ institutionId, batchId })
                                      .populate('teacherId', 'name')
                                      .sort({ dueDate: -1 });

  return sendResponse(res, 200, assignments);
});

const submitAssignment = catchAsync(async (req, res, next) => {
  const { id: assignmentId } = req.params;
  const validated = submissionSchema.parse(req.body);
  const studentId = req.user.sub || req.user.id;

  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) return next(new AppError('Assignment not found', 404));

  if (String(req.user.institutionId) !== String(assignment.institutionId)) {
    return next(new AppError('Forbidden: cross-institution access', 403));
  }

  const now = new Date();
  if (now > assignment.dueDate) {
    return next(new AppError('Deadline has passed, submission rejected', 400));
  }

  const existing = await Submission.findOne({ assignmentId, studentId });
  if (existing) {
    return next(new AppError('You have already submitted this assignment', 400));
  }

  const submission = await Submission.create({
    assignmentId,
    studentId,
    fileUrl: validated.fileUrl,
    fileType: validated.fileType,
    status: 'on-time'
  });

  return sendResponse(res, 201, submission, 'Assignment submitted successfully');
});

const getAssignmentSubmissions = catchAsync(async (req, res, next) => {
  const { id: assignmentId } = req.params;
  const assignment = await Assignment.findById(assignmentId);

  if (!assignment) return next(new AppError('Assignment not found', 404));
  if (String(req.user.institutionId) !== String(assignment.institutionId)) {
    return next(new AppError('Forbidden: cross-institution access', 403));
  }

  const submissions = await Submission.find({ assignmentId })
                                      .populate('studentId', 'name email avatarUrl')
                                      .sort({ createdAt: -1 });
                                      
  return sendResponse(res, 200, submissions);
});

const getMySubmissions = catchAsync(async (req, res, next) => {
  const { batchId } = req.params;
  const studentId = req.user.sub || req.user.id;
  
  if (req.user.role === 'Student' && String(req.user.batchId) !== String(batchId)) {
    return next(new AppError('Forbidden: not enrolled in this batch', 403));
  }

  // Find all assignments for this batch
  const assignments = await Assignment.find({ batchId }).select('_id');
  const assignmentIds = assignments.map(a => a._id);

  const submissions = await Submission.find({ studentId, assignmentId: { $in: assignmentIds } });
  
  return sendResponse(res, 200, submissions);
});


const deleteAssignment = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const assignment = await Assignment.findById(id);

  if (!assignment) return next(new AppError('Assignment not found', 404));
  if (String(req.user.institutionId) !== String(assignment.institutionId)) {
    return next(new AppError('Forbidden: cross-institution access', 403));
  }

  if (req.user.role === 'Teacher' && String(assignment.teacherId) !== String(req.user.id || req.user.sub)) {
     return next(new AppError('Forbidden: not your assignment', 403));
  }

  await Submission.deleteMany({ assignmentId: id });
  await Assignment.findByIdAndDelete(id);

  return sendResponse(res, 200, null, 'Assignment deleted');
});

const gradeSubmission = catchAsync(async (req, res, next) => {
  const { id: submissionId } = req.params;
  const { grade, feedback } = req.body;

  const submission = await Submission.findById(submissionId).populate('assignmentId');
  if (!submission) return next(new AppError('Submission not found', 404));

  // Access check
  if (String(req.user.institutionId) !== String(submission.assignmentId.institutionId)) {
    return next(new AppError('Forbidden: cross-institution access', 403));
  }

  // Only the assigned teacher can grade
  if (req.user.role === 'Teacher' && String(submission.assignmentId.teacherId) !== String(req.user.id || req.user.sub)) {
    return next(new AppError('Forbidden: not your assignment to grade', 403));
  }

  submission.grade = grade;
  submission.feedback = feedback;
  submission.gradedAt = new Date();
  submission.gradedBy = req.user.id || req.user.sub;
  await submission.save();

  return sendResponse(res, 200, submission, 'Submission graded successfully');
});

module.exports = {
  createAssignment,
  getBatchAssignments,
  submitAssignment,
  getAssignmentSubmissions,
  getMySubmissions,
  deleteAssignment,
  gradeSubmission
};
