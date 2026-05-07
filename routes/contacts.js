const express = require('express');
const { body, validationResult, param } = require('express-validator');

const EmergencyContact = require('../models/EmergencyContact');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Phone regex mirrored in backend validation and model
const phoneRegex = /^\+?[0-9\s().-]{7,20}$/;

// @route   POST /api/contacts
// @desc    Add an emergency contact for the authenticated user
// @access  Private
router.post(
  '/',
  protect,
  [
    body('name').trim().notEmpty().withMessage('Name is required').bail().isLength({ min: 2, max: 60 }).withMessage('Name must be 2-60 characters'),
    body('phoneNumber')
      .trim()
      .notEmpty()
      .withMessage('Phone number is required')
      .bail()
      .matches(phoneRegex)
      .withMessage('Please enter a valid phone number'),
    body('relationship')
      .trim()
      .notEmpty()
      .withMessage('Relationship is required')
      .bail()
      .isLength({ min: 2, max: 60 })
      .withMessage('Relationship must be 2-60 characters'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: errors.array()[0].msg,
          errors: errors.array(),
        });
      }

      const { name, phoneNumber, relationship } = req.body;

      const contact = await EmergencyContact.create({
        user: req.user._id,
        name,
        phoneNumber,
        relationship,
      });

      res.status(201).json({
        success: true,
        message: 'Emergency contact added successfully!',
        data: { contact },
      });
    } catch (error) {
      console.error('Add contact error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error adding emergency contact.',
      });
    }
  }
);

// @route   GET /api/contacts
// @desc    Get emergency contacts for the authenticated user
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const contacts = await EmergencyContact.find({ user: req.user._id }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: { contacts },
    });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching emergency contacts.',
    });
  }
});

// @route   DELETE /api/contacts/:id
// @desc    Delete a contact owned by the authenticated user
// @access  Private
router.delete(
  '/:id',
  protect,
  [
    param('id').isMongoId().withMessage('Invalid contact id'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: errors.array()[0].msg,
          errors: errors.array(),
        });
      }

      const contact = await EmergencyContact.findOneAndDelete({
        _id: req.params.id,
        user: req.user._id,
      });

      if (!contact) {
        return res.status(404).json({
          success: false,
          message: 'Emergency contact not found.',
        });
      }

      res.json({
        success: true,
        message: 'Emergency contact deleted successfully!',
      });
    } catch (error) {
      console.error('Delete contact error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error deleting emergency contact.',
      });
    }
  }
);

module.exports = router;

