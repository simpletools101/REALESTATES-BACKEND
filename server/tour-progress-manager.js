// server/tour-progress-manager.js
import { v4 as uuidv4 } from 'uuid';

const jobs = {};

function createJob() {
  const jobId = uuidv4();
  jobs[jobId] = {
    listeners: [],
    lastEvent: null,
    done: false,
  };
  return jobId;
}

function sendProgress(jobId, data) {
  if (!jobs[jobId]) return;
  jobs[jobId].lastEvent = data;
  jobs[jobId].listeners.forEach(res => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
  if (data.done || data.error) {
    jobs[jobId].done = true;
    jobs[jobId].listeners.forEach(res => res.end());
    jobs[jobId].listeners = [];
  }
}

function addListener(jobId, res) {
  if (!jobs[jobId]) return false;
  jobs[jobId].listeners.push(res);
  // Send last event if available
  if (jobs[jobId].lastEvent) {
    res.write(`data: ${JSON.stringify(jobs[jobId].lastEvent)}\n\n`);
  }
  return true;
}

function cleanupJob(jobId) {
  delete jobs[jobId];
}

export { createJob, sendProgress, addListener, cleanupJob };
