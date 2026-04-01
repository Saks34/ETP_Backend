const request = require('supertest');

// Mock User model
jest.mock('../src/modules/auth/user.model', () => ({
    User: {
        create: jest.fn(),
        findOne: jest.fn(),
        findById: jest.fn(),
    }
}));

const { User } = require('../src/modules/auth/user.model');
const app = require('../src/app');

describe('Auth Module', () => {
    describe('POST /api/auth/register', () => {
        it('should fail with missing fields due to validation', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({ name: 'Test' }); 
            
            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('message', 'Validation failed');
        });

        it('should succeed with valid data', async ( ) => {
            const mockUser = {
                _id: '507f1f77bcf86cd799439011',
                name: 'Test User',
                email: 'test@example.com',
                role: 'Student',
                comparePassword: jest.fn().mockResolvedValue(true),
                save: jest.fn().mockResolvedValue(true),
            };
            User.create.mockResolvedValue(mockUser);

            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Test User',
                    email: 'test@example.com',
                    password: 'password123'
                });

            expect(response.status).toBe(201);
            expect(response.body.user).toHaveProperty('email', 'test@example.com');
        });
    });

    describe('POST /api/auth/login', () => {
        it('should fail with invalid email format', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({ email: 'not-an-email', password: 'password123' });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Validation failed');
        });
    });
});
