import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../utils/response';
import { AgentService } from '../services/agent.service';

const getAgentIdFromRequest = (req: Request): number => {
    const rawId = (req.user as any)?.id;
    return Number(rawId);
};

export const getMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const agentId = getAgentIdFromRequest(req);
        const result = await AgentService.getMe(agentId);
        return successResponse(res, result);
    } catch (error) {
        next(error);
    }
};

export const uploadKyc = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const agentId = getAgentIdFromRequest(req);
        const files = (req.files as Express.Multer.File[]) || [];
        if (!Array.isArray(files) || files.length === 0) {
            throw { type: 'AppError', message: 'At least one document file is required', statusCode: 400 };
        }

        const fileUrls = files.map((file) => `/uploads/agent-kyc/${file.filename}`);
        const result = await AgentService.submitKyc(agentId, {
            docType: req.body.doc_type,
            fileUrls,
        });
        return successResponse(res, result, 'KYC submitted', 201);
    } catch (error) {
        next(error);
    }
};

export const patchOnline = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const agentId = getAgentIdFromRequest(req);
        const result = await AgentService.setOnlineStatus(agentId, req.body.is_online);
        return successResponse(res, result, 'Online status updated');
    } catch (error) {
        next(error);
    }
};

export const getAvailableJobs = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const agentId = getAgentIdFromRequest(req);
        const result = await AgentService.getAvailableJobs(agentId);
        return successResponse(res, result);
    } catch (error) {
        next(error);
    }
};

export const acceptJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const agentId = getAgentIdFromRequest(req);
        const bookingId = Number(req.params.id);
        const result = await AgentService.acceptJob(agentId, bookingId);
        return successResponse(res, result, 'Job accepted');
    } catch (error) {
        next(error);
    }
};

export const rejectJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const agentId = getAgentIdFromRequest(req);
        const bookingId = Number(req.params.id);
        const result = await AgentService.rejectJob(agentId, bookingId);
        return successResponse(res, result, 'Job rejected');
    } catch (error) {
        next(error);
    }
};

export const patchJobStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const agentId = getAgentIdFromRequest(req);
        const bookingId = Number(req.params.id);
        const result = await AgentService.updateJobStatus(agentId, bookingId, req.body.status);
        return successResponse(res, result, 'Job status updated');
    } catch (error) {
        next(error);
    }
};

export const getReferral = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const agentId = getAgentIdFromRequest(req);
        const result = await AgentService.getReferral(agentId);
        return successResponse(res, result);
    } catch (error) {
        next(error);
    }
};

export const getEarningsSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const agentId = getAgentIdFromRequest(req);
        const result = await AgentService.getEarningsSummary(agentId);
        return successResponse(res, result);
    } catch (error) {
        next(error);
    }
};

export const getEarningCampaigns = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await AgentService.getActiveCampaigns();
        return successResponse(res, result);
    } catch (error) {
        next(error);
    }
};

export const getProductCommissionPreview = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await AgentService.getProductCommissionPreview();
        return successResponse(res, result);
    } catch (error) {
        next(error);
    }
};

export const getCampaignProgress = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const agentId = getAgentIdFromRequest(req);
        const campaignId = Number(req.params.campaignId);
        const result = await AgentService.getCampaignProgress(agentId, campaignId);
        return successResponse(res, result);
    } catch (error) {
        next(error);
    }
};

export const patchLocation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const agentId = getAgentIdFromRequest(req);
        const result = await AgentService.updateLocation(agentId, req.body.lat, req.body.lng);
        return successResponse(res, result, 'Location updated');
    } catch (error) {
        next(error);
    }
};

export const postJobUpdate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const agentId = getAgentIdFromRequest(req);
        const bookingId = Number(req.params.bookingId);
        const result = await AgentService.postJobUpdate(agentId, bookingId, req.body);
        return successResponse(res, result, 'Update posted', 201);
    } catch (error) {
        next(error);
    }
};
