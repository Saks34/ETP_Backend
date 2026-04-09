const express = require('express');
const supportController = require('./support.controller');
const { auth, requireRoles } = require('../auth/auth.middleware');

const router = express.Router();
const supportStaffRoles = ['SuperAdmin', 'InstitutionAdmin', 'AcademicAdmin', 'Moderator'];

// All support routes require authentication
router.use(auth);

// Routes for all users (creating tickets, viewing their own)
router.route('/')
  .post(supportController.createTicket)

router.get('/my-tickets', supportController.getMyTickets);

router.route('/all')
  .get(requireRoles(...supportStaffRoles), supportController.getAllTickets);

router.route('/staff-options')
  .get(requireRoles(...supportStaffRoles), supportController.getStaffOptions);

router.route('/:id/reply')
  .post(supportController.replyToTicket);

router.route('/:id')
  .get(supportController.getTicketById)
  .patch(supportController.updateTicket);

module.exports = router;
