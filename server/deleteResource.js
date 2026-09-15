// Keep deletion explicit: snapshot syncs are upserts and may contain only an
// older device's data. Absence from a snapshot alone must not delete a recipe.
module.exports = function deleteResource(model, broadcast, event, label) {
  return async (req, res) => {
    try {
      const removed = await model.findOneAndDelete({ id: req.params.id });
      if (!removed) return res.status(404).json({ success: false, error: label + ' not found' });
      const remaining = await model.find().lean();
      broadcast(event, remaining, req.query.clientId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  };
};
