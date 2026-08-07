import React from 'react';
import { LeadData } from '../types';
import { 
  User, Mail, Phone, Building2, Briefcase, DollarSign, BarChart2, 
  TrendingUp, Calendar, ShieldAlert, Zap, Globe, Cpu, Users, Target, Activity
} from 'lucide-react';

interface SummaryProps {
  lead: LeadData;
}

export default function LeadSummary({ lead }: SummaryProps) {
  // Safe extraction of multiselect array
  const oportunidadesArray = Array.isArray(lead.origemLeads) 
    ? lead.origemLeads 
    : [lead.origemLeads || 'Não informado'];

  const summaryFields = [
    { label: 'Nome Completo', value: lead.nome, icon: User, color: 'text-sky-600' },
    { label: 'WhatsApp / Telefone', value: lead.whatsapp || lead.telefone, icon: Phone, color: 'text-sky-600' },
    { label: 'E-mail', value: lead.email, icon: Mail, color: 'text-sky-600' },
    { label: 'Segmento da Empresa', value: lead.segmento, icon: Briefcase, color: 'text-teal-600' },
    { label: 'Papel na Empresa', value: lead.papelEmpresa, icon: User, color: 'text-sky-600' },
    { label: 'Receita Mensal', value: lead.faturamento, icon: DollarSign, color: 'text-teal-600' },
    { label: 'Tamanho da Equipe', value: lead.tamanhoEquipe, icon: Users, color: 'text-sky-600' },
  ].filter(f => f.value && f.value !== 'Não informado' && f.value !== '');

  return (
    <div className="w-full text-left mt-6" id="lead-diagnostico-summary">
      <div className="flex items-center gap-2 mb-4 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
        <Zap className="w-5 h-5 text-teal-600 shrink-0" />
        <p className="text-xs text-slate-800 tracking-wide leading-relaxed font-sans font-medium">
          Diagnóstico pronto para a sua operação estratégica. Com base nos seus dados de faturamento (<span className="text-teal-700 font-bold">{lead.faturamento}</span>) e processos, preparamos um plano de crescimento sob medida.
        </p>
      </div>

      <div className="glass-panel bg-white border border-slate-200 rounded-2xl p-5 shadow-xl relative overflow-hidden">
        {/* Decor corner accents */}
        <div className="absolute top-0 right-0 w-8 h-[1px] bg-teal-500/40" />
        <div className="absolute top-0 right-0 w-[1px] h-8 bg-teal-500/40" />
        <div className="absolute bottom-0 left-0 w-8 h-[1px] bg-sky-500/40" />
        <div className="absolute bottom-0 left-0 w-[1px] h-8 bg-sky-500/40" />

        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h3 className="font-display font-medium text-xs tracking-widest text-slate-500 uppercase flex items-center gap-2">
            <span>DIAGNÓSTICO E QUALIFICAÇÃO CATALYIZE</span>
          </h3>
          <span className="text-[10px] font-mono text-teal-700 bg-teal-50 border border-teal-200 rounded px-2 py-0.5">
            ANALISADO
          </span>
        </div>

        {/* Bento Grid layout for response review */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[340px] overflow-y-auto pr-1 scrollbar-thin">
          {summaryFields.map((field, idx) => {
            const IconComponent = field.icon;
            return (
              <div 
                key={idx} 
                className="flex items-start gap-3 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl p-3 transition-colors group"
                id={`summary-item-${idx}`}
              >
                <div className={`p-1.5 rounded-lg bg-white border border-slate-200 shadow-xs group-hover:bg-slate-100 transition-colors ${field.color}`}>
                  <IconComponent className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-0.5">
                    {field.label}
                  </p>
                  <p className="text-xs font-sans font-medium text-slate-900 truncate whitespace-normal leading-tight">
                    {field.value}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* LGPD validation flag indicator */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100 text-[10px] font-mono text-teal-700">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span>AUTORIZAÇÃO DE TRATAMENTO DE DADOS COMERCIAIS ATIVA (LGPD)</span>
        </div>
      </div>
    </div>
  );
}

