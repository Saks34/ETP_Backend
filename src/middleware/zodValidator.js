const { z } = require('zod');
const AppError = require('../utils/AppError');

const validateZod = (schema) => (req, res, next) => {
  try {
    schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    next();
  } catch (error) {
    const message = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join('. ');
    next(new AppError(message, 400));
  }
};

const pollSchemas = {
  pushPoll: z.object({
    body: z.object({
      liveClassId: z.string().min(1),
      question: z.string().min(1),
      options: z.array(z.string()).length(4),
    }),
  }),
  submitAnswer: z.object({
    body: z.object({
      pollId: z.string().min(1),
      selectedOption: z.number().min(0).max(3),
      liveClassId: z.string().min(1),
    }),
  }),
};

module.exports = { validateZod, pollSchemas };
