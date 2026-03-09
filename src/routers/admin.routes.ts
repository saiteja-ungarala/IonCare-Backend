import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { requireAdmin } from '../middlewares/admin.middleware';
import * as AdminController from '../controllers/admin.controller';

const router = Router();

// All admin routes require authentication + admin role
router.use(authenticate, requireAdmin);

// Agent KYC
router.get('/kyc/agents', AdminController.listAgentKyc);
router.post('/kyc/agents/:agentId/approve', AdminController.approveAgentKyc);
router.post('/kyc/agents/:agentId/reject', AdminController.rejectAgentKyc);

// Dealer KYC
router.get('/kyc/dealers', AdminController.listDealerKyc);
router.post('/kyc/dealers/:dealerId/approve', AdminController.approveDealerKyc);
router.post('/kyc/dealers/:dealerId/reject', AdminController.rejectDealerKyc);

// Users
router.get('/users', AdminController.listUsers);

export default router;
