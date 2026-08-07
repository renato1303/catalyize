export interface LeadData {
  nome: string;
  whatsapp: string; // WhatsApp
  email: string;
  empresa: string;
  segmento: string;
  papelEmpresa?: string;
  faturamento: string;
  tamanhoEquipe?: string;
  operacaoComercial: string;
  origemLeads: string | string[]; // Como sua empresa gera novas oportunidades comerciais atualmente
  crm: string;
  desafioPrincipal: string;
  momentoEmpresa: string;
  investimentoMarketing: string;
  equipeComercial: string;
  prazoInicio: string;
  lgpd: boolean;
  
  // Metadata & Tracking
  id: string;
  createdAt: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  device?: string;
  browser?: string;

  // Real-time Database Fields requested
  status?: 'Novo' | 'Aguardando reunião' | 'Reunião agendada' | 'Reunião realizada' | 'Proposta enviada' | 'Fechado' | 'Perdido';
  leadScore?: number;
  dataCadastro?: string;
  horaCadastro?: string;
  dataReuniao?: string;
  horaReuniao?: string;
  googleMeetLink?: string;

  // Optional compat slots for admin panel references
  telefone?: string;
  historicoAds?: string;
  orcamentoAds?: string;
  mensalidadeGestao?: string;
  teveAgencia?: string;
  nomeAgencia?: string;
  objetivo?: string;
  prazo?: string;
}

export interface IntegrationConfig {
  webhookUrl: string;
  n8nUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  metaPixelId: string;
  gaTrackingId: string;
  gtmId: string;
  googleSheetsUrl: string;
  calendlyUrl?: string;
  adminPassword?: string;
}

export type QuestionType = 'text' | 'email' | 'tel' | 'select' | 'checkbox' | 'multiselect';

export interface Question {
  id: string;
  variable: keyof LeadData;
  type: QuestionType;
  title: string;
  placeholder?: string;
  options?: string[];
  required?: boolean;
  dependsOn?: {
    variable: keyof LeadData;
    value: any;
  };
}
