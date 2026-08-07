import { Question, LeadData, IntegrationConfig } from './types';

export const QUESTIONS_LIST: Question[] = [
  {
    id: 'p1',
    variable: 'segmento',
    type: 'select',
    title: 'Qual o segmento da sua empresa?',
    options: [
      'Saúde',
      'Finanças',
      'Jurídico',
      'Tecnologia/SaaS',
      'Serviços/Mentoria',
      'Consultoria'
    ],
    required: true,
  },
  {
    id: 'p2',
    variable: 'papelEmpresa',
    type: 'select',
    title: 'Qual seu papel na empresa?',
    options: [
      'Sócio/Proprietário',
      'Gerente/Líder',
      'Colaborador',
      'Freelancer'
    ],
    required: true,
  },
  {
    id: 'p3',
    variable: 'faturamento',
    type: 'select',
    title: 'Qual a receita mensal da empresa?',
    options: [
      'Abaixo de R$30 mil',
      'Entre R$30 mil e R$50 mil',
      'Entre R$50 mil e R$100 mil',
      'Entre R$300 mil e R$500 mil',
      'Entre R$500 mil à R$1 milhão'
    ],
    required: true,
  },
  {
    id: 'p4',
    variable: 'tamanhoEquipe',
    type: 'select',
    title: 'Quantas pessoas tem na sua equipe hoje?',
    options: [
      'Apenas eu',
      'de 2 a 10 pessoas',
      'de 10 a 50 pessoas',
      'Acima de 100 pessoas'
    ],
    required: true,
  }
];

export const DEFAULT_INTEGRATIONS_CONFIG: IntegrationConfig = {
  webhookUrl: 'https://seu-webhook.com/leads',
  n8nUrl: 'https://n8n.suaempresa.com/webhook/sense-sales',
  supabaseUrl: 'https://xyz.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9...',
  metaPixelId: '1234567890',
  gaTrackingId: 'G-XXXXXXXXXX',
  gtmId: 'GTM-XXXXXXX',
  googleSheetsUrl: 'https://script.google.com/macros/s/AKfycbwzKoS8TzwLwBDwiWGNc5a5ikI2q1P_twszpNo_6hof20UHoaTEli0llrcHlB19pPIZ/exec',
  calendlyUrl: 'https://calendly.com/contatosensesales/30min',
  adminPassword: 'sensesales@admin',
};

export const INITIAL_LEAD_DATA: LeadData = {
  nome: '',
  whatsapp: '',
  email: '',
  empresa: '',
  segmento: '',
  papelEmpresa: '',
  faturamento: '',
  tamanhoEquipe: '',
  operacaoComercial: '',
  origemLeads: '',
  crm: '',
  desafioPrincipal: '',
  momentoEmpresa: '',
  investimentoMarketing: '',
  equipeComercial: '',
  prazoInicio: '',
  lgpd: false,
  id: '',
  createdAt: '',
};

// Mask WhatsApp input to (XX) XXXXX-XXXX
export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function validatePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 11;
}

export function buildWhatsAppMessage(lead: LeadData): string {
  const baseMessage = `Olá, sou ${lead.nome}.

Acabei de realizar o diagnóstico comercial estratégico com a Catalyize!

📋 RESUMO DA MINHA OPERAÇÃO:
- Segmento: ${lead.segmento || 'Não informado'}
- Papel na empresa: ${lead.papelEmpresa || 'Não informado'}
- Receita mensal: ${lead.faturamento || 'Não informado'}
- Tamanho da equipe: ${lead.tamanhoEquipe || 'Não informado'}

📊 Lead Score Calculado: ${lead.leadScore ?? 0}%

Desejo conversar com o estrategista responsável para estruturarmos nossa máquina comercial com automações, CRM e geração previsível de demanda comercial!`;

  return encodeURIComponent(baseMessage);
}

export function calculateLeadScore(lead: Partial<LeadData>): number {
  let score = 0;

  // 1. Papel na empresa (Max 100)
  const papel = lead.papelEmpresa || '';
  if (papel.includes('Sócio/Proprietário')) score += 100;
  else if (papel.includes('Gerente/Líder')) score += 80;
  else if (papel.includes('Colaborador')) score += 50;
  else if (papel.includes('Freelancer')) score += 30;

  // 2. Receita mensal da empresa (Max 100)
  const faturamento = lead.faturamento || '';
  if (faturamento.includes('Abaixo de R$30 mil')) score += 30;
  else if (faturamento.includes('30 mil e R$50 mil')) score += 50;
  else if (faturamento.includes('50 mil e R$100 mil')) score += 70;
  else if (faturamento.includes('300 mil e R$500 mil')) score += 90;
  else if (faturamento.includes('500 mil à R$1 milhão')) score += 100;

  // 3. Tamanho da equipe (Max 100)
  const equipe = lead.tamanhoEquipe || '';
  if (equipe.includes('Apenas eu')) score += 30;
  else if (equipe.includes('2 a 10 pessoas')) score += 60;
  else if (equipe.includes('10 a 50 pessoas')) score += 85;
  else if (equipe.includes('Acima de 100 pessoas')) score += 100;

  // 4. Segmento (Max 100)
  const segmento = lead.segmento || '';
  if (segmento) score += 80;

  // Normalize by sum of weights (max 400) -> scale to percentage 0-100
  return Math.round((score / 400) * 100);
}
