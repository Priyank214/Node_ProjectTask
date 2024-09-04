# Task API

## Overview
This is a Node.js API that processes user tasks with rate limiting and task queueing. The API ensures that each user can only submit one task per second and no more than 20 tasks per minute. If the rate limit is exceeded, the task is queued for later processing.

### Prerequisites
- Node.js (v14+)
- Redis (running on localhost:6379)

### Request Structure
- Route: /api/v1/task
- Method: POST
- Body: JSON

{
    "user_id":"123"
}

### Install Dependencies built-in and external
- bull
- cluster
- express
- fs-extra
- nodemon
- os
- redis