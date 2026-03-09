import { Router } from 'express';
import { authenticate, requireRole } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { kycUpload } from '../middlewares/upload.middleware';
import { validateUploadedFiles } from '../middlewares/upload-validate.middleware';
import { AgentCampaignProgressSchema, AgentJobStatusSchema, AgentJobUpdateSchema, AgentKycSchema, AgentLocationSchema, AgentOnlineSchema } from '../dto/agent.dto';
import * as AgentController from '../controllers/agent.controller';
import { ROLES } from '../config/constants';

const router = Router();

router.use(authenticate);
router.use(requireRole(ROLES.AGENT));

router.get('/me', AgentController.getMe);
router.post('/kyc', kycUpload.any(), validateUploadedFiles, validate(AgentKycSchema), AgentController.uploadKyc);
router.patch('/location', validate(AgentLocationSchema), AgentController.patchLocation);
router.patch('/online', validate(AgentOnlineSchema), AgentController.patchOnline);
router.get('/jobs/available', AgentController.getAvailableJobs);
router.post('/jobs/:id/accept', AgentController.acceptJob);
router.post('/jobs/:id/reject', AgentController.rejectJob);
router.patch('/jobs/:id/status', validate(AgentJobStatusSchema), AgentController.patchJobStatus);
router.post('/jobs/:bookingId/updates', validate(AgentJobUpdateSchema), AgentController.postJobUpdate);
router.get('/earn/referral', AgentController.getReferral);
router.get('/earn/summary', AgentController.getEarningsSummary);
router.get('/earn/campaigns', AgentController.getEarningCampaigns);
router.get('/earn/products', AgentController.getProductCommissionPreview);
router.get('/earn/progress/:campaignId', validate(AgentCampaignProgressSchema), AgentController.getCampaignProgress);

export default router;
