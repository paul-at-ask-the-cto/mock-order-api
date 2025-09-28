const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const app = require('./server');
 
describe('Order Management API', () => {
  const mockToken = 'mock-token-12345';
  const testCustomerId = 'test-customer-123';

  // Helper function to create test order
  const createTestOrder = async (customerId = testCustomerId, items = null) => {
    const defaultItems = [
      { productId: 'prod-001', quantity: 2, unitPrice: 29.99 }
    ];
    
    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${mockToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        customerId,
        items: items || defaultItems
      });
    
    return response;
  };

  describe('Health Check', () => {
    test('GET /health should return healthy status', async () => {
      const response = await request(app).get('/api/v1/health');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('Authentication', () => {
    test('should reject requests without token', async () => {
      const response = await request(app)
        .get('/api/v1/orders?customerId=test');
      
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('UNAUTHORIZED');
    });

    test('should reject requests with empty token', async () => {
      const response = await request(app)
        .get('/api/v1/orders?customerId=test')
        .set('Authorization', 'Bearer ');
      
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('UNAUTHORIZED');
    });

    test('should accept valid token', async () => {
      const response = await request(app)
        .get('/api/v1/orders?customerId=test')
        .set('Authorization', `Bearer ${mockToken}`);
      
      expect(response.status).toBe(200);
    });
  });

  describe('Create Order', () => {
    test('should create order successfully', async () => {
      const items = [
        { productId: 'prod-001', quantity: 2, unitPrice: 29.99 },
        { productId: 'prod-002', quantity: 1, unitPrice: 15.50 }
      ];

      const response = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${mockToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({
          customerId: testCustomerId,
          items
        });

      expect(response.status).toBe(201);
      expect(response.body.orderId).toBeDefined();
      expect(response.body.customerId).toBe(testCustomerId);
      expect(response.body.status).toBe('pending');
      expect(response.body.totalAmount).toBe(75.48);
      expect(response.body.items).toHaveLength(2);
      expect(response.body.placementDate).toBeDefined();
      expect(response.body.lastUpdated).toBeDefined();
    });

    test('should handle idempotent requests', async () => {
      const idempotencyKey = uuidv4();
      const orderData = {
        customerId: testCustomerId,
        items: [{ productId: 'prod-001', quantity: 1, unitPrice: 10.00 }]
      };

      // First request
      const response1 = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${mockToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(orderData);

      expect(response1.status).toBe(201);

      // Second request with same idempotency key
      const response2 = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${mockToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(orderData);

      expect(response2.status).toBe(200);
      expect(response2.body.orderId).toBe(response1.body.orderId);
    });

    test('should reject order without idempotency key', async () => {
      const response = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          customerId: testCustomerId,
          items: [{ productId: 'prod-001', quantity: 1, unitPrice: 10.00 }]
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toContain('Idempotency-Key');
    });

    test('should reject order without customer ID', async () => {
      const response = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${mockToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({
          items: [{ productId: 'prod-001', quantity: 1, unitPrice: 10.00 }]
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toContain('Customer ID');
    });

    test('should reject order without items', async () => {
      const response = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${mockToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({
          customerId: testCustomerId,
          items: []
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    test('should reject order with invalid items', async () => {
      const response = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${mockToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({
          customerId: testCustomerId,
          items: [{ productId: 'prod-001', quantity: -1, unitPrice: 10.00 }]
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('Get Order', () => {
    test('should retrieve order by ID', async () => {
      // Create an order first
      const createResponse = await createTestOrder();
      const orderId = createResponse.body.orderId;

      // Retrieve the order
      const response = await request(app)
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body.orderId).toBe(orderId);
      expect(response.body.customerId).toBe(testCustomerId);
    });

    test('should return 404 for non-existent order', async () => {
      const response = await request(app)
        .get('/api/v1/orders/non-existent-order')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  describe('Search Orders', () => {
    test('should search orders by customer ID', async () => {
      // Create test orders
      await createTestOrder();
      await createTestOrder();

      const response = await request(app)
        .get(`/api/v1/orders?customerId=${testCustomerId}`)
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body.orders).toBeDefined();
      expect(response.body.totalCount).toBeGreaterThanOrEqual(2);
      expect(response.body.limit).toBe(20);
      expect(response.body.offset).toBe(0);
    });

    test('should search orders with date range', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const response = await request(app)
        .get(`/api/v1/orders?customerId=${testCustomerId}&startDate=${today}&endDate=${today}`)
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body.orders).toBeDefined();
    });

    test('should handle pagination', async () => {
      const response = await request(app)
        .get(`/api/v1/orders?customerId=${testCustomerId}&limit=5&offset=0`)
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body.limit).toBe(5);
      expect(response.body.offset).toBe(0);
    });

    test('should reject search without customer ID', async () => {
      const response = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    test('should reject invalid date format', async () => {
      const response = await request(app)
        .get(`/api/v1/orders?customerId=${testCustomerId}&startDate=invalid-date`)
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('Update Order Status', () => {
    test('should update order status successfully', async () => {
      // Create an order first
      const createResponse = await createTestOrder();
      const orderId = createResponse.body.orderId;

      // Update status
      const response = await request(app)
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          status: 'confirmed',
          reason: 'Payment processed'
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('confirmed');
      expect(response.body.statusReason).toBe('Payment processed');
      expect(response.body.lastUpdated).toBeDefined();
    });

    test('should reject invalid status transition', async () => {
      // Create an order first
      const createResponse = await createTestOrder();
      const orderId = createResponse.body.orderId;

      // Try to set invalid status transition (pending -> delivered)
      const response = await request(app)
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          status: 'delivered'
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('INVALID_STATUS_TRANSITION');
    });

    test('should reject invalid status', async () => {
      const createResponse = await createTestOrder();
      const orderId = createResponse.body.orderId;

      const response = await request(app)
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          status: 'invalid-status'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    test('should return 404 for non-existent order', async () => {
      const response = await request(app)
        .patch('/api/v1/orders/non-existent-order/status')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          status: 'confirmed'
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('NOT_FOUND');
    });

    test('should reject update without status', async () => {
      const createResponse = await createTestOrder();
      const orderId = createResponse.body.orderId;

      const response = await request(app)
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          reason: 'Some reason'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for unknown endpoints', async () => {
      const response = await request(app)
        .get('/api/v1/unknown-endpoint')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  describe('Status Transitions', () => {
    test('should allow valid status transitions', async () => {
      const createResponse = await createTestOrder();
      const orderId = createResponse.body.orderId;

      // pending -> confirmed
      const confirmedResponse = await request(app)
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ status: 'confirmed' });
      expect(confirmedResponse.status).toBe(200);

      // confirmed -> processing
      const processingResponse = await request(app)
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ status: 'processing' });
      expect(processingResponse.status).toBe(200);

      // processing -> shipped
      const shippedResponse = await request(app)
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ status: 'shipped' });
      expect(shippedResponse.status).toBe(200);

      // shipped -> delivered
      const deliveredResponse = await request(app)
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ status: 'delivered' });
      expect(deliveredResponse.status).toBe(200);
    });

    test('should allow cancellation from multiple states', async () => {
      const createResponse = await createTestOrder();
      const orderId = createResponse.body.orderId;

      // pending -> cancelled
      const response = await request(app)
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ status: 'cancelled' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('cancelled');
    });
  });
});
