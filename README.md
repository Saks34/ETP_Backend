# TeachFlow - Backend

The backend API for the TeachFlow educational platform, built with Node.js, Express, and MongoDB. It powers the authentication, data management, and real-time features of the application.

## 🚀 Features

*   **RESTful API:** Endpoints for managing users (Admins, Teachers, Students), batches, live classes, timetables, and analytics.
*   **Real-Time Communication:** Powered by `socket.io` for live chat, attendance, and instant notifications.
*   **Authentication & Security:** Secure JWT-based authentication, password hashing with `bcrypt`, and role-based access control (RBAC).
*   **File Management:** Integration with Cloudinary and Multer for handling file uploads (notes, profile pictures).
*   **Email Services:** Automated emails using `nodemailer` and Google APIs.
*   **Database:** Scalable architecture using MongoDB and Mongoose.

## 🛠️ Tech Stack

*   **Runtime:** [Node.js](https://nodejs.org/)
*   **Framework:** [Express.js](https://expressjs.com/)
*   **Database:** [MongoDB](https://www.mongodb.com/) with [Mongoose](https://mongoosejs.com/)
*   **Real-time:** [Socket.io](https://socket.io/)
*   **Authentication:** `jsonwebtoken`, `bcryptjs`
*   **Storage:** Cloudinary
*   **Logging:** Winston

## 📦 Installation

1.  **Navigate to the backend directory:**
    ```bash
    cd backend
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Setup:**
    Create a `.env` file in the root of the `backend` directory. You can use `.env.example` as a reference. Required variables typically include:
    ```env
    PORT=5000
    MONGO_URI=your_mongodb_connection_string
    JWT_SECRET=your_jwt_secret_key
    CLOUDINARY_CLOUD_NAME=your_cloud_name
    CLOUDINARY_API_KEY=your_api_key
    CLOUDINARY_API_SECRET=your_api_secret
    EMAIL_USER=your_email_address
    EMAIL_PASS=your_email_password
    FRONTEND_URL=http://localhost:5173
    ```

## 🏃‍♂️ Running the Server

### Development Mode
To start the server with `nodemon` for auto-restarts on changes:
```bash
npm run dev
```
The server will run at `http://localhost:5000` (or your defined PORT).

### Production Mode
To start the server in standard node mode:
```bash
npm start
```

## 📂 Project Structure

*   `src/config`: Configuration files (Database connection, Cloudinary, etc.).
*   `src/controllers`: Logic for handling API requests.
*   `src/models`: Mongoose schemas and models.
*   `src/routes`: API route definitions.
*   `src/middleware`: Custom middleware (Auth, Error handling).
*   `src/utils`: Helper functions and utilities.
*   `src/server.js`: Entry point of the application.

## 🤝 Contributing

1.  Fork the repository.
2.  Create a new feature branch (`git checkout -b feature/NewEndpoint`).
3.  Commit your changes (`git commit -m 'Add new endpoint'`).
4.  Push to the branch (`git push origin feature/NewEndpoint`).
5.  Open a Pull Request.
