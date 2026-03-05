import { Router } from 'express';
import { authenticate, requireRole } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { dealerKycUpload } from '../middlewares/upload.middleware';
import { validateUploadedFiles } from '../middlewares/upload-validate.middleware';
import { DealerKycSchema, DealerPricingProductSchema, DealerStatusPatchSchema } from '../dto/dealer.dto';
import * as DealerController from '../controllers/dealer.controller';
import { ROLES } from '../config/constants';

const router = Router();

router.use(authenticate);
router.use(requireRole(ROLES.DEALER));

router.get('/me', DealerController.getMe);
router.post('/kyc', dealerKycUpload.any(), validateUploadedFiles, validate(DealerKycSchema), DealerController.uploadKyc);
router.patch('/status', validate(DealerStatusPatchSchema), DealerController.patchStatus);
router.get('/pricing/products', DealerController.getPricingProducts);
router.get('/pricing/:productId', validate(DealerPricingProductSchema), DealerController.getPricingByProductId);

export default router;
