# AI Interviewer Platform

## Overview

This is a full-stack AI-powered interview practice platform built with React, Express, and PostgreSQL. The application provides realistic, multi-stage mock interviews with instant AI feedback to help job seekers prepare for their interviews. It features MCQ assessments, coding challenges, and voice interviews with comprehensive feedback and progress tracking.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **UI Framework**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **State Management**: TanStack Query (React Query) for server state
- **Routing**: Wouter for lightweight client-side routing
- **Authentication**: Firebase Auth with custom hooks

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM with PostgreSQL
- **Authentication**: Firebase Admin SDK for token verification
- **API Design**: RESTful API with Express routes

### Database Schema
- **Users**: Firebase UID, email, name, timestamps
- **Interviews**: User association, role, experience level, status, stages, scoring
- **Questions**: Multi-type questions (MCQ, coding, voice) with AI generation flags
- **Responses**: User answers with scoring, feedback, and performance metrics

## Key Components

### Authentication & Authorization
- Firebase Authentication for user management
- JWT token verification on backend routes
- Automatic user creation on first login
- Protected routes with authentication middleware

### AI Services Integration
- **Google Gemini AI**: Question generation, answer evaluation, feedback generation
- **OpenAI Whisper**: Audio transcription for voice interviews
- **Judge0 API**: Code execution and testing for coding challenges
- **Text-to-Speech**: Voice question delivery

### Interview System
- **Multi-stage Process**: MCQ → Coding → Voice interviews
- **Dynamic Question Generation**: AI-powered questions based on role and experience
- **Real-time Evaluation**: Instant feedback and scoring
- **Progress Tracking**: Stage completion and overall performance metrics

### Frontend Features
- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Component Library**: Comprehensive UI components from shadcn/ui
- **Form Handling**: React Hook Form with Zod validation
- **Audio Handling**: Voice recording and playback capabilities
- **Code Editor**: Integrated coding environment with syntax highlighting

## Data Flow

1. **User Authentication**: Firebase handles auth, backend verifies tokens
2. **Interview Creation**: User selects role/experience, creates interview session
3. **Question Generation**: AI generates relevant questions based on parameters
4. **User Responses**: Captured and stored with timestamps and metadata
5. **AI Evaluation**: Responses evaluated for correctness and quality
6. **Feedback Generation**: Comprehensive feedback and scoring provided
7. **Progress Tracking**: Results stored and accessible via dashboard

## External Dependencies

### Core Services
- **Firebase**: Authentication and user management
- **Google Gemini AI**: Question generation and evaluation
- **OpenAI**: Audio transcription services
- **Judge0**: Code execution platform
- **Neon Database**: PostgreSQL hosting

### Development Tools
- **Drizzle Kit**: Database migrations and schema management
- **ESBuild**: Production bundling for server code
- **TSX**: Development server with hot reload
- **Replit**: Development environment and deployment

## Deployment Strategy

### Development Environment
- **Hot Reload**: Vite dev server with TSX for backend
- **Database**: PostgreSQL via Drizzle ORM
- **Environment Variables**: Firebase config, API keys, database URL

### Production Build
- **Frontend**: Vite build with static asset optimization
- **Backend**: ESBuild compilation to single bundle
- **Database**: Drizzle migrations for schema updates
- **Deployment**: Replit Autoscale with port 80 external access

### Configuration
- **Package Scripts**: Separate dev/build/start commands
- **TypeScript**: Strict mode with ES modules
- **Path Aliases**: Simplified imports for client and shared code

## Changelog

- June 24, 2025: Initial setup with React frontend and Express backend
- June 24, 2025: Added PostgreSQL database integration with Drizzle ORM  
- June 24, 2025: Migrated from in-memory storage to database storage
- June 24, 2025: Implemented fallback system for AI services with demo authentication
- June 24, 2025: Tested and verified complete interview flow functionality
- June 24, 2025: Removed testimonials section from landing page per user request

## User Preferences

Preferred communication style: Simple, everyday language.