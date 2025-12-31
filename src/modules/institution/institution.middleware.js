function requireInstitutionContext(req, res, next) {
  const institutionId = req.user && req.user.institutionId;
  if (!institutionId) {
    return res.status(400).json({ message: 'Institution context is required' });
  }
  req.institutionId = institutionId;
  return next();
}

module.exports = { requireInstitutionContext };
