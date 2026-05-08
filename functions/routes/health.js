// Liveness probe. Used by load balancer health checks and the smoke
// scripts in the deploy workflow.
import { Router } from 'express';

const router = Router();

router.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

export default router;
