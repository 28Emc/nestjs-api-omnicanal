export interface WhatsAppReq {
    to: string;
    message: string;
}

export interface WhatsAppTemplateReq {
    to: string;
    template: string;
    templateParams: any[];
    code: string;
}

export interface WhatsAppReqTemplateParams {
    type: string;
    text: string;
}