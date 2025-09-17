# Auth² Service - API Requirements Document

## Project Overview

You are tasked with building **Auth²** (Authentication × Authorization) - a comprehensive web API service that provides centralized user authentication and authorization for multiple client applications. This service will handle user registration, login, verification, and role-based access control.

## Core Functionality Requirements

### 1. User Authentication System

#### 1.1 User Registration
- Users must be able to create new accounts with the following required information:
  - First name and last name
  - Email address (must be unique across the system)
  - Username (must be unique, alphanumeric with underscore/hyphen allowed)
  - Password (minimum 8 characters)
  - Phone number (minimum 10 digits)
- New accounts are created with **User** role (level 1) by default
- New accounts start with **pending** status until verification is complete
- System must prevent duplicate emails, usernames, and phone numbers
- Passwords must be securely hashed with unique salts (no plain text storage)

#### 1.2 User Login
- Users must authenticate using email and password
- Successful login returns a JWT token with 14-day expiration
- JWT token must contain user ID, role, and other necessary claims
- Failed login attempts should be handled gracefully
- Suspended or locked accounts must be denied access

#### 1.3 Password Management
- Users must be able to change their password (requiring old password verification)
- Password reset functionality via email-based tokens (1-hour expiration)
- Reset tokens must be single-use and expire appropriately

### 2. Account Verification System

#### 2.1 Email Verification
- Send verification emails with unique tokens (48-hour expiration)
- Email verification links must verify the account when clicked
- Users can request new verification emails (rate-limited to prevent spam)
- Verified email accounts gain additional privileges

#### 2.2 Phone Verification
- Send SMS verification codes (6-digit numeric, 15-minute expiration)
- Support multiple carrier gateways for SMS delivery
- Maximum 3 attempts per verification code
- Rate limiting: 1 SMS request per minute
- Phone verification enhances account security status

### 3. Role-Based Access Control

#### 3.1 Role Hierarchy (1-5, higher numbers = more privileges)
1. **User** - Basic access level
2. **Moderator** - User management capabilities
3. **Admin** - Full user CRUD operations, can create/manage equal or lower roles
4. **SuperAdmin** - System administration, can manage admins
5. **Owner** - Complete system control, can manage all roles

#### 3.2 Role-Based Permissions
- **Users (Role 1)**: Can only modify their own account, change password, verify email/phone
- **Moderators (Role 2)**: Can view user lists, basic user management
- **Admins (Role 3+)**: Can perform all user management operations on lower-role users
- **Higher roles inherit all permissions of lower roles**

#### 3.3 Role Modification Rules
- Users can only modify accounts with roles **lower** than their own
- **Exception**: Users with equal roles can only be modified by higher-role users
- **Role Assignment Rules**:
  - Admin (3) can assign roles 1-3 (User, Moderator, Admin)
  - SuperAdmin (4) can assign roles 1-4
  - Owner (5) can assign any role 1-5
- **Self-modification restrictions**: Users cannot change their own role or delete their own account
- **Security**: Prevent privilege escalation beyond the acting user's role level

### 4. Administrative User Management

#### 4.1 User Creation (Admin Feature)
- Admins can create new users with specified roles (within their hierarchy limits)
- Admin-created accounts start as **active** (skip pending status)
- Must enforce role hierarchy rules during creation

#### 4.2 User Management Operations
- **View Users**: Paginated user lists with filtering options
  - Filter by account status (active, pending, suspended, locked, deleted)
  - Filter by role level
  - Support pagination (configurable page size, maximum 100 per page)
- **User Search**: Search users by name, email, or username
  - Case-insensitive partial matching
  - Optional field-specific searching
  - Maintain pagination for search results
- **User Details**: View complete user information for any accessible user
- **Account Status Management**: Admins can change user account status
  - Set users as active, pending, suspended, or locked
  - Soft delete users (set status to deleted, don't remove from database)
- **Verification Override**: Admins can manually verify email/phone without verification process
- **Password Reset**: Admins can directly set new passwords for managed users

#### 4.3 Role Change Functionality
- Admins can promote users up to their own role level
- Admins can demote users with lower roles
- **Cannot** demote users with equal or higher roles (requires higher admin)
- **Cannot** promote users beyond their own role level
- Track and return both previous and new role information

#### 4.4 Dashboard Statistics
- Total user counts by status (active, pending, suspended, etc.)
- Verification statistics (email verified, phone verified counts)
- Recent user registration metrics (new users in past week/month)
- Role distribution statistics

### 5. Account Status Management

#### 5.1 Account Status Types
- **pending**: Newly created, awaiting verification
- **active**: Fully functional account
- **suspended**: Temporarily disabled (admin action)
- **locked**: Disabled due to security concerns
- **deleted**: Soft-deleted account (hidden from normal operations)

#### 5.2 Status-Based Access Rules
- **Pending**: Can login but limited functionality until verification
- **Active**: Full access to all features based on role
- **Suspended/Locked**: Cannot login, access denied
- **Deleted**: Treated as non-existent for most operations

### 6. Security Requirements

#### 6.1 Password Security
- Use SHA256 hashing with unique 32-byte salts per password
- Never store or transmit passwords in plain text
- Implement secure password change workflows

#### 6.2 Token Security
- JWT tokens for session management
- Include necessary claims (user ID, role, expiration)
- Implement proper token validation on protected endpoints
- Email verification tokens must be cryptographically secure (64-character random strings)

#### 6.3 Access Control
- All administrative endpoints require authentication and role verification
- Implement middleware for role-based route protection
- Prevent unauthorized access to user data
- Audit logs for sensitive operations (optional enhancement)

### 7. Data Validation Requirements

#### 7.1 Input Validation
- Email format validation and uniqueness
- Username format (3-50 characters, alphanumeric + underscore/hyphen)
- Password strength requirements (minimum 8 characters)
- Phone number format validation
- Role value validation (1-5 integer range)

#### 7.2 Error Handling
- Consistent error response format
- Meaningful error messages without exposing sensitive information
- Proper HTTP status codes
- Structured error codes for programmatic handling

### 8. API Design Requirements

#### 8.1 Response Format
- Consistent JSON response structure
- Include success/failure indicators
- Provide clear error messages and codes
- Return relevant data in standardized format

#### 8.2 Endpoint Organization
- Separate public (no authentication) and protected (authentication required) endpoints
- Group administrative functions under appropriate routes
- Use RESTful conventions where applicable
- Support pagination for list endpoints

#### 8.3 Documentation
- Comprehensive API documentation (OpenAPI/Swagger format recommended)
- Include request/response examples
- Document authentication requirements
- Specify role requirements for each endpoint

## Technical Constraints

### Database Requirements
- Use PostgreSQL for data persistence
- Implement proper foreign key relationships
- Design normalized tables for users, credentials, and verification tokens
- Support for timestamps (created_at, updated_at)

### Framework Requirements
- Node.js with Express.js framework
- TypeScript for type safety
- Environment-based configuration
- Proper error handling and logging

### Testing Requirements
- Unit tests for core business logic
- Integration tests for API endpoints
- Test role hierarchy enforcement
- Validate security measures

## Deliverables

1. **Functional API** meeting all requirements above
2. **Database schema** with proper relationships and constraints
3. **API documentation** in OpenAPI/Swagger format
4. **Test suite** covering critical functionality
5. **README** with setup and usage instructions

## Evaluation Criteria

Your implementation will be evaluated on:
- **Functionality**: Does it meet all specified requirements?
- **Security**: Are passwords secure? Is role hierarchy enforced?
- **Code Quality**: Clean, readable, well-structured code
- **Error Handling**: Graceful handling of edge cases and errors
- **Documentation**: Clear, comprehensive API documentation
- **Testing**: Adequate test coverage for critical features

## Optional Enhancements

If you complete the core requirements, consider these enhancements:
- Email service integration for verification emails
- SMS service integration for phone verification
- Rate limiting implementation
- Audit logging for administrative actions
- Account lockout after failed login attempts
- Multi-factor authentication support
- API key management for client applications

---

**Note**: This document specifies *what* your API should do, not *how* to implement it. The specific route names, database table structures, and implementation details are left to your design decisions. Focus on meeting the functional requirements while following best practices for security and code quality.