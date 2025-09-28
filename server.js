const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
 
// Middleware

app.use(cors());
app.use(express.json());

// In-memory storage

let orders = new Map();
let idempotencyKeys = new Map();

// Valid status transitions

const STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: []
};

// Auth middleware

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentication token is required'
    });
  }

  // For mock purposes, accept any non-empty token
  if (token.length === 0) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Invalid authentication token'
    });
  }

  next();
};

// Validation middleware

const validateCreateOrder = (req, res, next) => {
  const { customerId, items } = req.body;
  const idempotencyKey = req.headers['idempotency-key'];

  if (!idempotencyKey) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Idempotency-Key header is required'
    });
  }

  if (!customerId) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Customer ID is required'
    });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'At least one item is required'
    });
  }

  for (const item of items) {
    if (!item.productId || !item.quantity || !item.unitPrice) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Each item must have productId, quantity, and unitPrice'
      });
    }
    if (item.quantity <= 0 || item.unitPrice < 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Quantity must be positive and unitPrice must be non-negative'
      });
    }
  }

  next();
};

// Utility functions

const calculateTotal = (items) => {
  return items.reduce((total, item) => total + (item.quantity * item.unitPrice), 0);
};

const createOrder = (customerId, items, orderId = null) => {
  const id = orderId || `ord-${uuidv4()}`;
  const now = new Date().toISOString();
  
  const order = {
    orderId: id,
    customerId,
    placementDate: now,
    lastUpdated: now,
    status: 'pending',
    items: items.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice
    })),
    totalAmount: Number(calculateTotal(items).toFixed(2))
  };

  orders.set(id, order);
  return order;
};

// Routes

// Health check

app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Create order (with idempotency)

app.post('/api/v1/orders', authenticateToken, validateCreateOrder, (req, res) => {
  const { customerId, items } = req.body;
  const idempotencyKey = req.headers['idempotency-key'];

  // Check if we've seen this idempotency key before
  if (idempotencyKeys.has(idempotencyKey)) {
    const existingOrderId = idempotencyKeys.get(idempotencyKey);
    const existingOrder = orders.get(existingOrderId);
    return res.status(200).json(existingOrder);
  }

  try {
    const order = createOrder(customerId, items);
    idempotencyKeys.set(idempotencyKey, order.orderId);
    
    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to create order'
    });
  }
});

// Get order by ID

app.get('/api/v1/orders/:orderId', authenticateToken, (req, res) => {
  const { orderId } = req.params;
  
  if (!orders.has(orderId)) {
    return res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Order not found'
    });
  }

  res.json(orders.get(orderId));
});

// Search orders

app.get('/api/v1/orders', authenticateToken, (req, res) => {
  const { customerId, startDate, endDate, limit = 20, offset = 0 } = req.query;

  if (!customerId) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Customer ID is required'
    });
  }

  try {
    let filteredOrders = Array.from(orders.values())
      .filter(order => order.customerId === customerId);

    // Apply date filters if provided

    if (startDate) {
      const start = new Date(startDate);
      if (isNaN(start.getTime())) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid start date format'
        });
      }
      filteredOrders = filteredOrders.filter(order => 
        new Date(order.placementDate) >= start
      );
    }

    if (endDate) {
      const end = new Date(endDate + 'T23:59:59.999Z'); // End of day
      if (isNaN(end.getTime())) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid end date format'
        });
      }
      filteredOrders = filteredOrders.filter(order => 
        new Date(order.placementDate) <= end
      );
    }

    // Sort by placement date (newest first)

    filteredOrders.sort((a, b) => new Date(b.placementDate) - new Date(a.placementDate));

    const totalCount = filteredOrders.length;
    const limitNum = Math.min(parseInt(limit), 100);
    const offsetNum = parseInt(offset);

    const paginatedOrders = filteredOrders.slice(offsetNum, offsetNum + limitNum);

    res.json({
      orders: paginatedOrders,
      totalCount,
      limit: limitNum,
      offset: offsetNum
    });
  } catch (error) {
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to search orders'
    });
  }
});

// Update order status

app.patch('/api/v1/orders/:orderId/status', authenticateToken, (req, res) => {
  const { orderId } = req.params;
  const { status, reason } = req.body;

  if (!orders.has(orderId)) {
    return res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Order not found'
    });
  }

  if (!status) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Status is required'
    });
  }

  const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
    });
  }

  const order = orders.get(orderId);
  const currentStatus = order.status;

  // Validate status transition

  if (!STATUS_TRANSITIONS[currentStatus].includes(status)) {
    return res.status(409).json({
      error: 'INVALID_STATUS_TRANSITION',
      message: `Cannot transition from ${currentStatus} to ${status}`
    });
  }

  try {
    order.status = status;
    order.lastUpdated = new Date().toISOString();
    
    if (reason) {
      order.statusReason = reason;
    }

    orders.set(orderId, order);
    res.json(order);
  } catch (error) {
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to update order status'
    });
  }
});

// Error handling middleware

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred'
  });
});

// 404 handler

app.use('*', (req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: 'Endpoint not found'
  });
});

// Seed data for testing

const seedData = () => {
  console.log('Seeding test data...');
  
  // Create some sample orders

  const sampleOrders = [
    {
      customerId: 'cust-12345',
      items: [
        { productId: 'prod-001', quantity: 2, unitPrice: 29.99 },
        { productId: 'prod-002', quantity: 1, unitPrice: 15.50 }
      ]
    },
    {
      customerId: 'cust-12345',
      items: [
        { productId: 'prod-003', quantity: 1, unitPrice: 99.99 }
      ]
    },
    {
      customerId: 'cust-67890',
      items: [
        { productId: 'prod-001', quantity: 3, unitPrice: 29.99 }
      ]
    }
  ];

  sampleOrders.forEach((orderData, index) => {
    const order = createOrder(orderData.customerId, orderData.items);

    // Update some orders to different statuses
    
    if (index === 1) {
      order.status = 'confirmed';
    } else if (index === 2) {
      order.status = 'shipped';
    }
    orders.set(order.orderId, order);
  });

  console.log(`Created ${sampleOrders.length} sample orders`);
};

// Start server

app.listen(PORT, () => {
  console.log(`Mock Order Management API running on http://localhost:${PORT}`);
  console.log(`API documentation available in OpenAPI specification`);
  console.log(`Health check: http://localhost:${PORT}/api/v1/health`);
  
  // Seed some test data

  seedData();
  
  console.log('\nSample requests:');
  console.log('- GET /api/v1/health (no auth required)');
  console.log('- POST /api/v1/orders (requires Bearer token and Idempotency-Key header)');
  console.log('- GET /api/v1/orders?customerId=cust-12345 (requires Bearer token)');
  console.log('\nUse any non-empty string as Bearer token for authentication');
});

module.exports = app;
