import { Router } from 'express';
import { getActiveBanners } from '../controllers/admin.controller';

const router = Router();

// Public — no auth required
router.get('/active', getActiveBanners);

export default router;
