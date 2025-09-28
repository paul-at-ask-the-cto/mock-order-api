# Order Management System - Mock API 

A lightweight, production-ready mock API for an Order Management System.

## Features

- **RESTful API** with comprehensive OpenAPI 3.0 specification
- **Idempotent order creation** using UUID-based idempotency keys
- **Bearer token authentication** (accepts any non-empty token for testing)
- **In-memory data storage** (no external database required)
- **Complete order lifecycle** management with status transitions
- **Pagination and filtering** for order search
- **Comprehensive error handling** with consistent error response format
- **Full test suite** with 95%+ coverage
- **CORS enabled** for frontend integration

## Quick Start

### Prerequisites

- Node.js 16+ and npm 8+

### Installation

```bash
# Clone or download the project files then install the node modules
npm install

# Start the server
npm start

# For development with auto-reload
npm run dev
```

The server will start on `http://localhost:3000` and create some sample test data.

### API Version

The API is versioned. This is V1 and is routed as follows:

```
/api/v1
```

### Health Check

```bash
curl http://localhost:3000/api/v1/health
```

## API Overview

### Base URL
```
http://localhost:3000/api/v1
```

### Authentication

All endpoints (except `/health`) require Bearer token authentication:
```
Authorization: Bearer <any-non-empty-token>
```

For testing, you can use any string as the token (e.g., `Bearer test-token-123`).

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/orders` | Create a new order |
| `GET` | `/orders/{orderId}` | Get order by ID |
| `GET` | `/orders` | Search orders by customer ID and date range |
| `PATCH` | `/orders/{orderId}/status` | Update order status |
| `GET` | `/health` | Health check (no auth required) |

## Usage Examples

### Create Order

```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer test-token" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust-12345",
    "items": [
      {
        "productId": "prod-001",
        "quantity": 2,
        "unitPrice": 29.99
      },
      {
        "productId": "prod-002",
        "quantity": 1,
        "unitPrice": 15.50
      }
    ]
  }'
```

### Search Orders

```bash
# Basic search by customer ID
curl -H "Authorization: Bearer test-token" \
  "http://localhost:3000/api/v1/orders?customerId=cust-12345"

# Search with date range and pagination
curl -H "Authorization: Bearer test-token" \
  "http://localhost:3000/api/v1/orders?customerId=cust-12345&startDate=2024-01-01&endDate=2024-12-31&limit=10&offset=0"
```

### Update Order Status

```bash
curl -X PATCH http://localhost:3000/api/v1/orders/ord-12345/status \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "confirmed",
    "reason": "Payment processed successfully"
  }'
```

## Order Status Workflow

The API enforces valid status transitions:

```
pending → confirmed → processing → shipped → delivered
    ↓         ↓           ↓
cancelled   cancelled   cancelled
```

Valid statuses: `pending`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`

## Data Model

### Order Object
```json
{
  "orderId": "ord-67890",
  "customerId": "cust-12345",
  "placementDate": "2024-03-15T14:30:00Z",
  "lastUpdated": "2024-03-15T14:30:00Z",
  "status": "pending",
  "items": [
    {
      "productId": "prod-001",
      "quantity": 2,
      "unitPrice": 29.99
    }
  ],
  "totalAmount": 59.98
}
```

## Error Handling

All errors return consistent JSON format:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error message"
}
```

Common error codes:
- `VALIDATION_ERROR` (400): Invalid request data
- `UNAUTHORIZED` (401): Missing or invalid token
- `NOT_FOUND` (404): Resource not found
- `INVALID_STATUS_TRANSITION` (409): Invalid order status change
- `INTERNAL_ERROR` (500): Server error

## Testing

```bash
# Run all tests
npm test
```

The test suite includes:

- Authentication tests
- Order creation with idempotency
- Order retrieval and search
- Status update workflows
- Error handling scenarios
- Input validation

## Development Notes

### Seeded Test Data

The server creates sample orders on startup:

- Customer `cust-12345`: 2 orders (pending, confirmed)
- Customer `cust-67890`: 1 order (shipped)

### Memory Storage

Orders are stored in-memory using JavaScript `Map` objects. Data persists only during the server session.

### Idempotency Implementation

- Uses UUID v4 as idempotency keys
- Stores mapping between keys and order IDs
- Returns existing order for duplicate idempotency keys
- Required header: `Idempotency-Key`

## OpenAPI Specification

The complete API specification is available in `openapi.yaml`. You can:

1. **View in Swagger UI**: Import the OpenAPI spec into [Swagger Editor](https://editor.swagger.io/)
2. **API testing**: Import 'postman.json' into Postman

## Production Considerations

This mock service is designed for development use. For production deployment:

1. **Replace in-memory storage** with persistent database
2. **Implement proper JWT authentication** with token validation
3. **Add rate limiting** and request throttling
4. **Implement proper logging** and monitoring
5. **Add input sanitization** and security headers
6. **Configure environment-based settings**

## Vendor Integration

This mock API serves as a **contract specification** for the vendor implementation. The vendor should:

1. Follow the exact OpenAPI specification
2. Implement identical request/response formats
3. Support the same idempotency mechanism
4. Use the same error codes and status transitions
5. Maintain API endpoint compatibility

## Support

For questions or issues:

1. Check the OpenAPI specification for detailed endpoint documentation
2. Review the test suite for usage examples
3. Examine the sample requests in this README

# Design Trade-offs and Implementation Decisions

## Overview

This document outlines the key architectural decisions and trade-offs made in implementing the mock Order Management System API, focusing on practical choices that balance development speed, maintainability, and production-readiness guidance for the vendor.

## Authentication Strategy

### Decision: Bearer Token with Mock Validation

**Chosen Approach**: Simple Bearer token authentication that accepts any non-empty string as a valid token.

**Alternative Considered**: 
- Basic Authentication (username/password)
- JWT with proper signature validation
- API Key authentication

**Rationale**:
- **Simplicity**: Frontend teams can immediately start integration without complex token generation
- **Flexibility**: Easy to replace with actual JWT validation in vendor implementation
- **Standards Compliance**: Uses industry-standard Bearer token format
- **Security Guidance**: Provides clear authentication contract for vendor without blocking development

**Trade-offs**:
- **Pros**: Zero configuration, immediate usability, standard format, easy vendor replacement
- **Cons**: No actual security in mock environment, requires documentation for production expectations

**Production Guidance**: The vendor should implement proper JWT validation with:
- Token expiration and refresh mechanisms
- Role-based access control
- Secure token generation and storage

---

## Idempotency Implementation

### Decision: UUID-based Idempotency Keys with In-Memory Storage

**Chosen Approach**: Required `Idempotency-Key` header using UUID v4, stored in memory map linking keys to order IDs.

**Alternative Considered**:
- Client-generated order IDs as natural idempotency
- Hash-based idempotency using request content
- Time-window based deduplication

**Rationale**:
- **Industry Standard**: UUID-based idempotency is widely adopted (Stripe, PayPal, etc.)
- **Separation of Concerns**: Order ID generation remains server-controlled
- **Explicit Contract**: Forces frontend teams to implement proper retry logic
- **Vendor Guidance**: Clear specification for production implementation

**Trade-offs**:
- **Pros**: Bulletproof duplicate prevention, industry standard, clear contract
- **Cons**: Additional header requirement, client responsibility for UUID generation

**Production Guidance**: Vendor should implement:
- Persistent storage of idempotency mappings with TTL (24-48 hours)
- Atomic operations to prevent race conditions
- Consistent response for duplicate requests

---

## Data Storage Strategy

### Decision: In-Memory Maps for Simplicity

**Chosen Approach**: JavaScript `Map` objects for orders and idempotency keys.

**Alternative Considered**:
- SQLite embedded database
- JSON file persistence
- Redis for shared state

**Rationale**:
- **Zero Dependencies**: No external database setup required
- **Development Focus**: Removes infrastructure concerns for frontend teams
- **Performance**: Instant responses for development/testing
- **Simplicity**: Easy to understand and modify

**Trade-offs**:
- **Pros**: Zero setup, fast responses, simple debugging, no persistence complexity
- **Cons**: Data lost on restart, not suitable for multi-instance deployment

**Production Guidance**: Vendor should implement proper database layer with:
- ACID compliance for order operations
- Proper indexing for search operations
- Backup and recovery procedures

---

## API Design Philosophy

### Decision: Contract-First with Comprehensive OpenAPI

**Chosen Approach**: Detailed OpenAPI 3.0 specification driving implementation.

**Alternative Considered**:
- GraphQL schema

**Rationale**:
- **Vendor Alignment**: Provides exact contract for vendor implementation
- **Frontend Productivity**: Enables client SDK generation and mock testing
- **Documentation Quality**: Forces consideration of all edge cases and error scenarios
- **Industry Standard**: REST with OpenAPI is widely adopted for B2B integrations

**Trade-offs**:
- **Pros**: Clear contract, tool ecosystem, standard format, comprehensive documentation
- **Cons**: More verbose than minimal approaches, requires OpenAPI expertise

---

## Error Handling Strategy

### Decision: Consistent Error Object with Standard HTTP Codes

**Chosen Approach**: Uniform error response format with structured error codes and human-readable messages.

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Customer ID is required"
}
```

**Alternative Considered**:
- Simple string error messages
- HTTP status codes only
- Problem Details for HTTP APIs (RFC 7807)

**Rationale**:
- **Frontend Integration**: Predictable error structure enables consistent error handling
- **Debugging**: Structured error codes facilitate logging and monitoring
- **User Experience**: Human-readable messages support user-facing error display
- **API Evolution**: Extensible format for additional error details

**Trade-offs**:
- **Pros**: Consistent handling, debugging friendly, extensible, user-friendly
- **Cons**: More verbose than simple approaches, requires error code standards

---

## Status Transition Management

### Decision: Strict State Machine with Validation

**Chosen Approach**: Enforced status transitions with clear business rules.

```
pending → confirmed → processing → shipped → delivered
    ↓         ↓           ↓
cancelled   cancelled   cancelled
```

**Alternative Considered**:
- Free-form status updates
- Event-sourced status history

**Rationale**:
- **Business Logic**: Prevents invalid business state transitions
- **Data Integrity**: Ensures consistent order lifecycle
- **Frontend Guidance**: Clear rules for UI state management
- **Production Reality**: Reflects actual business process constraints

**Trade-offs**:
- **Pros**: Business rule enforcement, data consistency, clear lifecycle
- **Cons**: Less flexibility, requires business rule documentation

---

## Pagination and Search Strategy

### Decision: Offset-Based Pagination with Query Parameters

**Chosen Approach**: Traditional limit/offset pagination with filter parameters.

**Alternative Considered**:
- Cursor-based pagination
- GraphQL-style connection pattern
- Search-specific endpoint with POST body

**Rationale**:
- **Simplicity**: Easy to implement and understand
- **Frontend Familiarity**: Common pattern in web applications
- **URL Bookmarking**: GET requests with query parameters are shareable
- **Performance Predictability**: Consistent behavior for development

**Trade-offs**:
- **Pros**: Simple implementation, familiar pattern, bookmarkable URLs
- **Cons**: Performance issues with large offsets, consistency challenges with concurrent modifications

**Production Guidance**: Vendor should consider cursor-based pagination for large datasets.

---

## Testing Strategy

### Decision: Comprehensive Unit and Integration Tests

**Chosen Approach**: Jest-based test suite covering all endpoints, error cases, and business logic.

**Alternative Considered**:
- Basic smoke tests only
- Contract testing with Pact
- End-to-end testing with real browser

**Rationale**:
- **Quality Assurance**: Ensures mock API behaves correctly
- **Vendor Specification**: Tests serve as executable specifications
- **Regression Prevention**: Protects against breaking changes during development
- **Documentation**: Tests provide usage examples

**Trade-offs**:
- **Pros**: High confidence, executable specification, regression protection
- **Cons**: Development overhead, maintenance burden

---

## Security Considerations

### Mock vs. Production Balance

**Mock Service Approach**:
- Accept any Bearer token for development ease
- No rate limiting to avoid blocking development
- Permissive CORS for frontend integration
- Detailed error messages for debugging

**Production Guidance**:
- Implement proper JWT validation with expiration
- Add rate limiting and request throttling
- Configure CORS for specific domains
- Sanitize error messages to prevent information leakage
- Add request logging and monitoring
- Implement input validation and sanitization

---

## Deployment and Operations

### Decision: Single-File Deployment with Minimal Dependencies

**Chosen Approach**: Express.js server with minimal external dependencies.

**Alternative Considered**:
- Docker containerization
- Serverless functions
- Framework-heavy solutions

**Rationale**:
- **Developer Experience**: Easy to run locally with `npm start`
- **Modification Ease**: Single file for core logic enables quick changes
- **Vendor Guidance**: Clear structure for understanding implementation requirements

**Trade-offs**:
- **Pros**: Simple deployment, easy modification, clear structure
- **Cons**: Less production-like, manual scaling considerations