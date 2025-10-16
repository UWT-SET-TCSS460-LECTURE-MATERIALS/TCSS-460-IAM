# TCSS-460-auth-squared

**Identity and Authentication/Authorization Service**
_Authentication × Authorization = Auth²_

## Overview

Auth² (Auth Squared) is a centralized identity and access management service that provides authentication and authorization capabilities for multiple client services. This service handles user registration, login, credential management, and service-level access control.

## Core Features

### Authentication (AuthN)

- User registration
- User login/logout
- Password management (reset, change)
- Token generation and validation
- Session management

### Authorization (AuthZ)

- Service registration and management
- User-to-service access control
- Role-based permissions
- Service-level API key management
- Cross-service authorization checks

## API Endpoints

### Authentication Endpoints

- `POST /auth/register` - Register new user
- `POST /auth/login` - Authenticate user
- `POST /auth/logout` - End user session
- `POST /auth/refresh` - Refresh access token
- `POST /auth/change-password` - Update user password
- `POST /auth/reset-password` - Initiate password reset

### Authorization Endpoints

- `POST /services` - Register new service
- `GET /services` - List all services
- `POST /services/:serviceId/users` - Grant user access to service
- `DELETE /services/:serviceId/users/:userId` - Revoke user access
- `GET /services/:serviceId/users` - List users with service access
- `POST /auth/verify` - Verify user permissions for service

## Technology Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: [TBD - PostgreSQL/MySQL/MongoDB]
- **Authentication**: JWT tokens
- **Password Security**: bcrypt

## Getting Started

### Prerequisites

```bash
node --version  # v18+ recommended
npm --version   # v9+ recommended
```
