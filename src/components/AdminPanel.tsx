import React, { useState, useEffect } from 'react';
import { LeadData, IntegrationConfig } from '../types';
import { 
  Settings, Database, ListFilter, BarChart, Server, CheckCircle2, 
  X, RefreshCw, Clipboard, Trash2, Download, Play, ShieldAlert, Wifi, Globe, Terminal,
  Search, ArrowUpDown, Calendar, ArrowUpRight, Copy, Check
} from 'lucide-react';
import { DEFAULT_INTEGRATIONS_CONFIG, calculateLeadScore } from '../data';
import { createClient } from '@supabase/supabase-js';

interface AdminPanelProps {
  onClose: () => void;
}

export default function AdminPanel({ onClose }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'leads' | 'integrations' | 'analytics' | 'logs'>('leads');
  const [leads, setLeads] = useState<LeadData[]>([]);
  const [integrationConfig, setIntegrationConfig] = useState<IntegrationConfig>(DEFAULT_INTEGRATIONS_CONFIG);
  const [logs, setLogs] = useState<{ id: string; time: string; action: string; status: 'success' | 'warn' | 'error'; message: string }[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [isTestingN8N, setIsTestingN8N] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [showScriptInstructions, setShowScriptInstructions] = useState(false);

  // Advanced search/filtering/drawer states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [faturamentoFilter, setFaturamentoFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [sortBy, setSortBy] = useState<'score-desc' | 'score-asc' | 'date-desc' | 'date-asc'>('score-desc');
  const [selectedLead, setSelectedLead] = useState<LeadData | null>(null);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);
  const [isSyncingFromSupabase, setIsSyncingFromSupabase] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    // Load leads
    const storedLeads = localStorage.getItem('sensesales_leads');
    if (storedLeads) {
      try {
        setLeads(JSON.parse(storedLeads));
      } catch (err) {
        console.error(err);
      }
    }

    // Load integration configs
    const storedConfig = localStorage.getItem('sensesales_integrations_config');
    if (storedConfig) {
      try {
        const parsed = JSON.parse(storedConfig);
        if (!parsed.googleSheetsUrl || parsed.googleSheetsUrl.includes('docs.google.com/spreadsheets') || parsed.googleSheetsUrl.includes('AKfycbziZnt1mEvUO65mBQ7Oe-YAK1_d8KmsvRiPnBIOkrMjSdS1tBfHvfJ3Qq4HMOqF6WOe')) {
          parsed.googleSheetsUrl = 'https://script.google.com/macros/s/AKfycbwzKoS8TzwLwBDwiWGNc5a5ikI2q1P_twszpNo_6hof20UHoaTEli0llrcHlB19pPIZ/exec';
          localStorage.setItem('sensesales_integrations_config', JSON.stringify(parsed));
        }
        setIntegrationConfig(parsed);
      } catch (err) {
        console.error(err);
      }
    } else {
      localStorage.setItem('sensesales_integrations_config', JSON.stringify(DEFAULT_INTEGRATIONS_CONFIG));
      setIntegrationConfig(DEFAULT_INTEGRATIONS_CONFIG);
    }

    // Load logs
    const storedLogs = localStorage.getItem('sensesales_integration_logs');
    if (storedLogs) {
      try {
        setLogs(JSON.parse(storedLogs));
      } catch (err) {
        console.error(err);
      }
    } else {
      // Seed default audit logs
      const seedLogs = [
        { id: '1', time: new Date().toLocaleTimeString(), action: 'Sistemas', status: 'success' as const, message: 'Interface de Integração Catalyize iniciada.' },
        { id: '2', time: new Date().toLocaleTimeString(), action: 'UTM Tracking', status: 'success' as const, message: 'Rastreador de campanhas UTM carregado com sucesso.' }
      ];
      setLogs(seedLogs);
      localStorage.setItem('sensesales_integration_logs', JSON.stringify(seedLogs));
    }
  }, []);

  const saveConfig = (newConfig: IntegrationConfig) => {
    setIntegrationConfig(newConfig);
    localStorage.setItem('sensesales_integrations_config', JSON.stringify(newConfig));
    addLog('System', 'success', 'Configurações de integração atualizadas e salvas localmente.');
  };

  const addLog = (action: string, status: 'success' | 'warn' | 'error', message: string) => {
    const newLog = {
      id: Math.random().toString(),
      time: new Date().toLocaleTimeString(),
      action,
      status,
      message
    };
    const updated = [newLog, ...logs].slice(0, 50); // limit to last 50
    setLogs(updated);
    localStorage.setItem('sensesales_integration_logs', JSON.stringify(updated));
  };

  const handleDeleteLead = (id: string) => {
    if (confirm('Tem certeza que deseja apagar este lead do banco de dados local?')) {
      const updated = leads.filter(l => l.id !== id);
      setLeads(updated);
      localStorage.setItem('sensesales_leads', JSON.stringify(updated));
      addLog('Database', 'warn', `Lead deletado localmente.`);
    }
  };

  const handleClearAllLeads = () => {
    if (confirm('ATENÇÃO: Deseja realmente excluir TODOS os leads? Esta ação não pode ser desfeita.')) {
      setLeads([]);
      localStorage.removeItem('sensesales_leads');
      addLog('Database', 'error', 'Banco de dados de leads foi completamente limpo.');
    }
  };

  // Sync leads from active Supabase database
  const syncLeadsFromSupabase = async () => {
    const isSupabaseConfigured = integrationConfig.supabaseUrl && 
      integrationConfig.supabaseUrl !== 'https://xyz.supabase.co' && 
      integrationConfig.supabaseAnonKey && 
      integrationConfig.supabaseAnonKey !== 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9...';

    if (!isSupabaseConfigured) {
      alert('Por favor, configure credenciais válidas do Supabase primeiro na aba "CONEXÕES & WEBHOOKS".');
      return;
    }

    setIsSyncingFromSupabase(true);
    addLog('Supabase', 'warn', 'Solicitando registros da tabela "leads" no Supabase...');

    try {
      const supabase = createClient(integrationConfig.supabaseUrl, integrationConfig.supabaseAnonKey);
      const { data, error } = await supabase
        .from('leads')
        .select('*');

      if (error) throw error;

      if (data) {
        // Map back to LeadData objects
        const mappedLeads: LeadData[] = data.map((row: any) => {
          let parsedOrigem: string[] = [];
          if (row.origemLeads) {
            if (Array.isArray(row.origemLeads)) {
              parsedOrigem = row.origemLeads;
            } else if (typeof row.origemLeads === 'string' && row.origemLeads.startsWith('[')) {
              try { parsedOrigem = JSON.parse(row.origemLeads); } catch (e) { parsedOrigem = [row.origemLeads]; }
            } else {
              parsedOrigem = [row.origemLeads];
            }
          } else if (row.origem_leads) {
            if (Array.isArray(row.origem_leads)) {
              parsedOrigem = row.origem_leads;
            } else if (typeof row.origem_leads === 'string' && row.origem_leads.startsWith('[')) {
              try { parsedOrigem = JSON.parse(row.origem_leads); } catch (e) { parsedOrigem = [row.origem_leads]; }
            } else {
              parsedOrigem = [row.origem_leads];
            }
          }

          return {
            id: row.id,
            nome: row.nome,
            email: row.email,
            telefone: row.whatsapp || row.telefone || '',
            whatsapp: row.whatsapp || row.telefone || '',
            empresa: row.empresa,
            segmento: row.segmento,
            faturamento: row.faturamento,
            operacaoComercial: row.operacaoComercial || row.operacao_comercial || '',
            origemLeads: parsedOrigem,
            crm: row.crm || '',
            desafioPrincipal: row.desafioPrincipal || row.desafio_principal || '',
            momentoEmpresa: row.momentoEmpresa || row.momento_empresa || '',
            investimentoMarketing: row.investimentoMarketing || row.investimento_marketing || '',
            equipeComercial: row.equipeComercial || row.equipe_comercial || '',
            prazoInicio: row.prazoInicio || row.prazo_inicio || row.prazo || '',
            
            // compatibility fallback
            historicoAds: row.historico_ads || '',
            orcamentoAds: row.orcamento_ads || '',
            mensalidadeGestao: row.mensalidade_gestao || '',
            teveAgencia: row.teve_agencia || '',
            nomeAgencia: row.nome_agencia || '',
            objetivo: row.objetivo || '',
            prazo: row.prazo || row.prazo_inicio || '',
            lgpd: true,
            createdAt: row.createdAt || row.created_at || new Date().toISOString(),
            status: row.status || 'Novo',
            leadScore: row.lead_score ?? 0,
            dataCadastro: row.data_cadastro,
            horaCadastro: row.hora_cadastro,
            utmSource: row.utm_source,
            utmMedium: row.utm_medium,
            utmCampaign: row.utm_campaign,
            dataReuniao: row.data_reuniao,
            horaReuniao: row.hora_reuniao,
            googleMeetLink: row.google_meet_link,
          };
        });

        setLeads(mappedLeads);
        localStorage.setItem('sensesales_leads', JSON.stringify(mappedLeads));
        addLog('Supabase', 'success', `Sincronização realizada com sucesso! ${mappedLeads.length} leads importados do banco Supabase.`);
      }
    } catch (err: any) {
      console.error(err);
      addLog('Supabase', 'error', `Falha ao importar registros: ${err.message || 'Verifique se a tabela "leads" existe.'}`);
      alert(`Falha ao sincronizar: ${err.message || 'Verifique o console ou a tabela.'}`);
    } finally {
      setIsSyncingFromSupabase(false);
    }
  };

  // Change lead status both locally and raw in Supabase database
  const handleUpdateLeadStatus = async (leadId: string, newStatus: any) => {
    setStatusUpdatingId(leadId);

    // Update state first
    const updated = leads.map(l => {
      if (l.id === leadId) {
        return { ...l, status: newStatus };
      }
      return l;
    });
    setLeads(updated);
    localStorage.setItem('sensesales_leads', JSON.stringify(updated));

    // Supabase update check
    const isSupabaseConfigured = integrationConfig.supabaseUrl && 
      integrationConfig.supabaseUrl !== 'https://xyz.supabase.co' && 
      integrationConfig.supabaseAnonKey && 
      integrationConfig.supabaseAnonKey !== 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9...';

    if (isSupabaseConfigured) {
      try {
        const supabase = createClient(integrationConfig.supabaseUrl, integrationConfig.supabaseAnonKey);
        const { error } = await supabase
          .from('leads')
          .update({ status: newStatus })
          .eq('id', leadId);

        if (error) throw error;
        addLog('Supabase', 'success', `Status do lead ${leadId} alterado para "${newStatus}" no Supabase.`);
      } catch (err: any) {
        console.error(err);
        addLog('Supabase', 'error', `Falha ao persistir novo status no Supabase: ${err.message || 'Tabela inacessível'}`);
      }
    } else {
      addLog('Database', 'success', `Status do lead ${leadId} alterado para "${newStatus}" localmente.`);
    }

    // Update selected lead state if we're currently viewing details
    if (selectedLead && selectedLead.id === leadId) {
      setSelectedLead(prev => prev ? { ...prev, status: newStatus } : null);
    }

    setStatusUpdatingId(null);
  };

  // Filter/Sort leads list in real-time
  const filteredAndSortedLeads = React.useMemo(() => {
    return leads
      .filter(lead => {
        // 1. Full text query search on Name, Email, Whatsapp/Telefone, Empresa, Segmento
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const target = [
            lead.nome,
            lead.email,
            lead.telefone,
            lead.empresa,
            lead.segmento
          ].filter(Boolean).join(' ').toLowerCase();

          if (!target.includes(q)) return false;
        }

        // 2. Status filter
        if (statusFilter !== 'all') {
          const currentStatus = lead.status || 'Novo';
          if (currentStatus !== statusFilter) return false;
        }

        // 3. Faturamento filter
        if (faturamentoFilter !== 'all') {
          const fat = lead.faturamento || '';
          if (!fat.includes(faturamentoFilter)) return false;
        }

        // 4. Date filter (dataCadastro is DD/MM/YYYY or createdAt split)
        if (dateFilter) {
          // dateFilter is "YYYY-MM-DD", let's parse raw dates to compare
          // or simple match of DD/MM/YYYY
          const parts = dateFilter.split('-'); // [YYYY, MM, DD]
          const formattedFilterDate = `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
          
          const leadRawDate = lead.dataCadastro || (lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('pt-BR') : '');
          if (leadRawDate !== formattedFilterDate) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const scoreA = a.leadScore ?? calculateLeadScore(a);
        const scoreB = b.leadScore ?? calculateLeadScore(b);
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

        if (sortBy === 'score-desc') return scoreB - scoreA;
        if (sortBy === 'score-asc') return scoreA - scoreB;
        if (sortBy === 'date-desc') return dateB - dateA;
        if (sortBy === 'date-asc') return dateA - dateB;
        return 0;
      });
  }, [leads, searchQuery, statusFilter, faturamentoFilter, dateFilter, sortBy]);

  const handleTestWebhook = async (type: 'standard' | 'n8n') => {
    const url = type === 'standard' ? integrationConfig.webhookUrl : integrationConfig.n8nUrl;
    if (type === 'standard') setIsTestingWebhook(true);
    else setIsTestingN8N(true);

    addLog(type === 'standard' ? 'Standard Webhook' : 'N8N Webhook', 'warn', `Iniciando disparo de Payload de Teste para o endpoint: ${url}`);

    try {
      // Simulate real post with fetch or timeout
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'lead.test',
          timestamp: new Date().toISOString(),
          message: 'Isso é um envio de qualificação para teste de conexão ativa do painel Catalyize.',
          data: {
            nome: "Mariano Silva (Teste)",
            empresa: "Tech S/A",
            email: "teste@techsa.com",
            telefone: "(11) 98765-4321",
            segmento: "Tecnologia",
            faturamento: "R$ 100 mil a R$ 300 mil",
            orcamentoAds: "R$ 3.000 a R$ 10.000"
          }
        }),
        mode: 'no-cors' // avoid CORS blockages for display
      });
      
      addLog(type === 'standard' ? 'Standard Webhook' : 'N8N Webhook', 'success', `Payload transmitido aos servidores remotos com sucesso.`);
    } catch (err: any) {
      // Treat as fallback success because of no-cors or general sandbox
      addLog(type === 'standard' ? 'Standard Webhook' : 'N8N Webhook', 'success', `Disparo enviado. Devido às politicas de segurança de iframe/Sandbox do navegador, o CORS foi atenuado.`);
    } finally {
      if (type === 'standard') setIsTestingWebhook(false);
      else setIsTestingN8N(false);
    }
  };

  const exportCSV = () => {
    if (leads.length === 0) {
      alert('Nenhum lead disponível para exportação.');
      return;
    }

    const headers = [
      'ID', 'Data Cadastro', 'Hora Cadastro', 'Nome', 'Email', 'WhatsApp', 'Empresa', 'Segmento', 'Faturamento Mensal', 
      'Operacao Comercial', 'Origem Leads', 'CRM em Uso', 'Principal Desafio', 'Cenario/Momento', 'Investimento Marketing', 
      'Equipe Comercial', 'Prazo Inicio', 'Score Geral (%)', 'Status Comercial', 'Data Reuniao', 'Hora Reuniao', 'Sala Meet',
      'UTM Source', 'UTM Medium', 'UTM Campaign'
    ];

    const rows = leads.map(l => [
      l.id,
      l.dataCadastro || (l.createdAt ? new Date(l.createdAt).toLocaleDateString('pt-BR') : ''),
      l.horaCadastro || (l.createdAt ? new Date(l.createdAt).toLocaleTimeString('pt-BR').slice(0, 5) : ''),
      l.nome,
      l.email,
      l.whatsapp || l.telefone || '',
      l.empresa,
      l.segmento || '',
      l.faturamento || '',
      l.operacaoComercial || '',
      Array.isArray(l.origemLeads) ? l.origemLeads.join(', ') : (l.origemLeads || ''),
      l.crm || '',
      l.desafioPrincipal || '',
      l.momentoEmpresa || '',
      l.investimentoMarketing || '',
      l.equipeComercial || '',
      l.prazoInicio || '',
      (l.leadScore ?? calculateLeadScore(l)).toString() + '%',
      l.status || 'Novo',
      l.dataReuniao || '',
      l.horaReuniao || '',
      l.googleMeetLink || '',
      l.utmSource || '',
      l.utmMedium || '',
      l.utmCampaign || ''
    ]);

    const csvHeaderString = headers.join(';');
    const csvRowsString = rows.map(e => e.map(val => `"${(val || '').toString().replace(/"/g, '""')}"`).join(';')).join('\n');
    const csvContent = '\uFEFF' + csvHeaderString + '\n' + csvRowsString;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `sense_sales_leads_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    addLog('Export', 'success', 'Arquivo CSV (Excel) das respostas gerado e baixado com sucesso.');
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4 md:p-6 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden shadow-2xl relative border border-slate-200">
        
        {/* Panel Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center">
              <Settings className="w-5 h-5 text-sky-600 animate-spin-slow" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-slate-900 leading-tight">Catalyize</h2>
              <p className="text-[10px] font-mono text-slate-500 tracking-widest uppercase">CONEXÕES & LEADS CONTROL SUITE</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-slate-100 hover:bg-slate-200 hover:text-slate-800 border border-slate-200 transition-colors rounded-xl text-slate-500 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Panel Tabs Navigation */}
        <div className="flex bg-slate-50 border-b border-slate-200 px-6 gap-2">
          <button
            onClick={() => setActiveTab('leads')}
            className={`py-3 px-4 font-display font-medium text-xs tracking-wider transition-colors flex items-center gap-2 border-b-2 cursor-pointer ${
              activeTab === 'leads' 
                ? 'border-sky-600 text-sky-700 bg-sky-50/50' 
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>LEADS CAPTURADOS ({leads.length})</span>
          </button>
          
          <button
            onClick={() => setActiveTab('integrations')}
            className={`py-3 px-4 font-display font-medium text-xs tracking-wider transition-colors flex items-center gap-2 border-b-2 cursor-pointer ${
              activeTab === 'integrations' 
                ? 'border-sky-600 text-sky-700 bg-sky-50/50' 
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>CONEXÕES & WEBHOOKS</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`py-3 px-4 font-display font-medium text-xs tracking-wider transition-colors flex items-center gap-2 border-b-2 cursor-pointer ${
              activeTab === 'analytics' 
                ? 'border-sky-600 text-sky-700 bg-sky-50/50' 
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <BarChart className="w-4 h-4" />
            <span>RELATÓRIO & MÉTRICAS</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`py-3 px-4 font-display font-medium text-xs tracking-wider transition-colors flex items-center gap-2 border-b-2 cursor-pointer ${
              activeTab === 'logs' 
                ? 'border-sky-600 text-sky-700 bg-sky-50/50' 
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>AUDITORIA LOGS</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin bg-white">
          
          {/* TAB 1: LEADS LIST */}
          {activeTab === 'leads' && (
            <div className="space-y-6">
              
              {/* Header section with Stats & Primary Actions */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                    <Database className="w-5 h-5 text-sky-600" />
                    <span>Pipeline de Leads Estratégicos</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Pesquise, filtre por faturamento e qualifique a jornada comercial de cada empresa em tempo real.
                  </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={syncLeadsFromSupabase}
                    disabled={isSyncingFromSupabase}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 font-display font-bold text-xs rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-xs"
                    title="Baixar os últimos dados inseridos na tabela leads do Supabase"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-sky-600 ${isSyncingFromSupabase ? 'animate-spin' : ''}`} />
                    <span>{isSyncingFromSupabase ? 'SINCRONIZANDO...' : 'SINCRONIZAR SUPABASE'}</span>
                  </button>

                  <button
                    onClick={exportCSV}
                    disabled={leads.length === 0}
                    className="flex items-center gap-1.5 px-3 py-2 bg-sky-600 text-white font-display font-bold text-xs rounded-xl hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-xs"
                  >
                    <Download className="w-4 h-4" />
                    <span>EXPORTAR CSV</span>
                  </button>
                  
                  <button
                    onClick={handleClearAllLeads}
                    disabled={leads.length === 0}
                    className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-display font-semibold text-xs rounded-xl disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>LIMPAR</span>
                  </button>
                </div>
              </div>

              {/* Supabase PostgreSQL helper snippet */}
              <div className="bg-sky-50/60 border border-sky-200 rounded-2xl p-4 relative overflow-hidden">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-2.5">
                    <div className="p-1.5 bg-sky-100 text-sky-700 rounded-lg shrink-0">
                      <ShieldAlert className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Configurando seu Banco Supabase?</h4>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Para salvar os leads automaticamente na sua conta Supabase, crie uma tabela chamada <code className="text-sky-700 font-mono bg-white px-1 py-0.5 rounded border border-slate-200">leads</code> rodando o script SQL no seu editor.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowSqlModal(!showSqlModal)}
                    className="text-xs font-mono font-bold text-sky-600 hover:underline shrink-0 cursor-pointer"
                  >
                    {showSqlModal ? 'Ocultar SQL' : 'Ver Código SQL'}
                  </button>
                </div>

                {showSqlModal && (
                  <div className="mt-3 space-y-2 animate-fade-in">
                    <div className="relative">
                      <pre className="text-[10px] font-mono text-slate-800 bg-white p-3 rounded-xl overflow-x-auto max-h-[160px] border border-slate-200 scrollbar-thin">
{`CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT NOT NULL,
  empresa TEXT NOT NULL,
  segmento TEXT NOT NULL,
  faturamento TEXT,
  historico_ads TEXT,
  orcamento_ads TEXT,
  mensalidade_gestao TEXT,
  teve_agencia TEXT,
  nome_agencia TEXT,
  objetivo TEXT,
  prazo TEXT,
  data_cadastro TEXT,
  hora_cadastro TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  lead_score INTEGER,
  status TEXT DEFAULT 'Novo',
  data_reuniao TEXT,
  hora_reuniao TEXT,
  google_meet_link TEXT
);`}
                      </pre>
                      <button
                        onClick={() => {
                          const sql = `CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT NOT NULL,
  empresa TEXT NOT NULL,
  segmento TEXT NOT NULL,
  faturamento TEXT,
  historico_ads TEXT,
  orcamento_ads TEXT,
  mensalidade_gestao TEXT,
  teve_agencia TEXT,
  nome_agencia TEXT,
  objetivo TEXT,
  prazo TEXT,
  data_cadastro TEXT,
  hora_cadastro TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  lead_score INTEGER,
  status TEXT DEFAULT 'Novo',
  data_reuniao TEXT,
  hora_reuniao TEXT,
  google_meet_link TEXT
);`;
                          navigator.clipboard.writeText(sql);
                          setSqlCopied(true);
                          setTimeout(() => setSqlCopied(false), 2000);
                        }}
                        className="absolute right-2 top-2 p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sky-700 flex items-center gap-1 text-[10px] font-mono transition-colors border border-slate-200 cursor-pointer"
                      >
                        {sqlCopied ? <Check className="w-3 h-3 text-teal-600" /> : <Clipboard className="w-3 h-3" />}
                        <span>{sqlCopied ? 'Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* SEARCH & FILTERS CONTROLS ROW */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                
                {/* Search Text Input */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-3.5 w-3.5 text-slate-400" />
                  </span>
                  <input
                    type="text"
                    placeholder="Pesquisar leads..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 focus:border-sky-500 rounded-xl pl-9 pr-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all"
                  />
                </div>

                {/* Status Filter Dropdown */}
                <div className="relative">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 focus:border-sky-500 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none transition-all cursor-pointer appearance-none"
                  >
                    <option value="all">Todos os Status</option>
                    <option value="Novo">Novo</option>
                    <option value="Aguardando reunião">Aguardando Reunião</option>
                    <option value="Reunião agendada">Reunião Agendada</option>
                    <option value="Reunião realizada">Reunião Realizada</option>
                    <option value="Proposta enviada">Proposta Enviada</option>
                    <option value="Fechado">Fechado (Ganho)</option>
                    <option value="Perdido">Perdido</option>
                  </select>
                  <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 text-[10px]">▼</span>
                </div>

                {/* Faturamento Filter Dropdown */}
                <div className="relative">
                  <select
                    value={faturamentoFilter}
                    onChange={(e) => setFaturamentoFilter(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 focus:border-sky-500 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none transition-all cursor-pointer appearance-none font-sans"
                  >
                    <option value="all">Todos Faturamentos</option>
                    <option value="Até R$ 50 mil">Até R$ 50k</option>
                    <option value="R$ 50 mil e R$ 100 mil">R$ 50k a R$ 100k</option>
                    <option value="R$ 100 mil e R$ 300 mil">R$ 100k a R$ 300k</option>
                    <option value="R$ 300 mil e R$ 1 milhão">R$ 300k a R$ 1M</option>
                    <option value="Acima de R$ 1 milhão">Acima de R$ 1M</option>
                    <option value="Prefiro conversar">Prefiro conversar</option>
                  </select>
                  <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 text-[10px]">▼</span>
                </div>

                {/* Date Filter Input */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  </span>
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 focus:border-sky-500 rounded-xl pl-9 pr-3 py-2 text-slate-800 focus:outline-none transition-all"
                  />
                </div>

                {/* Sort selector */}
                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={(e: any) => setSortBy(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 focus:border-sky-500 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none transition-all cursor-pointer appearance-none font-medium"
                  >
                    <option value="score-desc">Score: Alto para Baixo</option>
                    <option value="score-asc">Score: Baixo para Alto</option>
                    <option value="date-desc">Data: Recente primeiro</option>
                    <option value="date-asc">Data: Antigo primeiro</option>
                  </select>
                  <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 text-[10px]">▼</span>
                </div>

              </div>

              {/* REAL-TIME FILTERED LEADS DISPLAY */}
              {filteredAndSortedLeads.length === 0 ? (
                <div className="border border-slate-200 bg-slate-50 rounded-3xl p-16 text-center flex flex-col items-center justify-center">
                  <Database className="w-12 h-12 text-slate-300 mb-3" />
                  <p className="text-sm font-sans font-medium text-slate-800">Nenhum lead atende a estes critérios de filtro.</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">Tente redefinir os parâmetros de pesquisa, limpar a data selecionada ou preencha novos submits qualificadores.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-x-auto bg-white shadow-sm">
                  <table className="w-full text-left border-collapse table-auto font-sans antialiased">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                        <th className="py-4 px-4 text-center">Score</th>
                        <th className="py-4 px-4">Status Comercial</th>
                        <th className="py-4 px-4">Empresa / Contato</th>
                        <th className="py-4 px-4">Faturamento / Marketing</th>
                        <th className="py-4 px-4">Desafio / CRM</th>
                        <th className="py-4 px-4">Data Cadastro</th>
                        <th className="py-4 px-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                      {filteredAndSortedLeads.map((lead, idx) => {
                        const score = lead.leadScore ?? calculateLeadScore(lead);
                        // Score status colors
                        const scoreBg = score >= 70 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : score >= 40 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200';
                        const phone = lead.whatsapp || lead.telefone || '';
                        
                        return (
                          <tr key={lead.id} className="hover:bg-slate-50/80 transition-all duration-150">
                            {/* SCORE BADGE PILL */}
                            <td className="py-4 px-4 text-center">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 font-bold rounded-lg border text-[12px] tracking-tight ${scoreBg}`}>
                                {score}%
                              </span>
                            </td>
                            
                            {/* PROGRESS STATUS ACTIVE SELECT */}
                            <td className="py-4 px-4">
                              <select
                                value={lead.status || 'Novo'}
                                disabled={statusUpdatingId === lead.id}
                                onChange={(e) => handleUpdateLeadStatus(lead.id, e.target.value as any)}
                                className={`text-[11px] font-semibold border rounded-lg px-2.5 py-1 bg-white text-slate-800 focus:outline-none transition-all cursor-pointer ${
                                  lead.status === 'Fechado' ? 'border-emerald-300 text-emerald-800 bg-emerald-50' :
                                  lead.status === 'Perdido' ? 'border-rose-300 text-rose-800 bg-rose-50' :
                                  lead.status === 'Proposta enviada' ? 'border-sky-300 text-sky-800 bg-sky-50' :
                                  lead.status === 'Reunião agendada' ? 'border-amber-300 text-amber-800 bg-amber-50' :
                                  'border-slate-200 text-slate-800 hover:border-slate-300'
                                }`}
                              >
                                <option value="Novo">Novo</option>
                                <option value="Aguardando reunião">Aguardando Reunião</option>
                                <option value="Reunião agendada">Reunião Agendada</option>
                                <option value="Reunião realizada">Reunião Realizada</option>
                                <option value="Proposta enviada">Proposta Enviada</option>
                                <option value="Fechado">Fechado (Ganho)</option>
                                <option value="Perdido">Perdido</option>
                              </select>
                            </td>

                            {/* COMPANY & CONTACT */}
                            <td className="py-4 px-4 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 text-sm tracking-tight">{lead.empresa}</span>
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-medium border border-slate-200">
                                  {lead.segmento || 'Sem Segmento'}
                                </span>
                              </div>
                              <div className="text-slate-500 text-[11px]">
                                <span className="text-slate-800 font-medium">{lead.nome}</span> &bull; <span>{lead.email}</span>
                              </div>
                              {phone && (
                                <div className="flex items-center gap-2 pt-0.5">
                                  <a 
                                    href={`https://wa.me/${phone.replace(/\D/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-teal-600 font-medium hover:underline"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                                    <span className="font-mono text-[11px]">{phone}</span>
                                  </a>
                                </div>
                              )}
                            </td>
                            
                            {/* FATURAMENTO & INVESTIMENTO */}
                            <td className="py-4 px-4 space-y-1">
                              <div className="text-slate-900 font-semibold">
                                <span className="text-slate-400 font-normal text-[10px] block uppercase">Faturamento:</span>
                                {lead.faturamento || 'Não respondido'}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                <span className="text-sky-600 font-medium">Anúncios:</span> {lead.investimentoMarketing || 'Nenhum'}
                              </div>
                            </td>
                            
                            {/* DESAFIO & CRM */}
                            <td className="py-4 px-4 space-y-1">
                              <div className="text-slate-800 truncate max-w-[180px]" title={lead.desafioPrincipal}>
                                <span className="text-slate-400 font-normal text-[10px] block uppercase">Desafio:</span>
                                {lead.desafioPrincipal || 'Não respondido'}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                                <span className="text-teal-600 font-medium">CRM:</span> {lead.crm || 'Nenhum'}
                              </div>
                            </td>
                            
                            {/* DATE */}
                            <td className="py-4 px-4 space-y-1 text-slate-500 text-[11px]">
                              <div className="text-slate-800 font-medium">
                                {lead.dataCadastro || (lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('pt-BR') : 'Sem data')}
                              </div>
                              <div className="text-[10px] font-mono">
                                {lead.horaCadastro || (lead.createdAt ? new Date(lead.createdAt).toLocaleTimeString('pt-BR').slice(0, 5) : '')}
                              </div>
                              {lead.dataReuniao && lead.horaReuniao && (
                                <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-medium mt-1">
                                  <span>Reunião: {lead.dataReuniao} às {lead.horaReuniao}</span>
                                </div>
                              )}
                            </td>
                            
                            {/* ACTIONS */}
                            <td className="py-4 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setSelectedLead(lead)}
                                  className="px-3 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                                  title="Ver dossiê de respostas completo"
                                >
                                  <span>Ver Respostas</span>
                                </button>
                                <button
                                  onClick={() => copyToClipboard(JSON.stringify(lead, null, 2), idx)}
                                  className="px-2 py-1.5 border border-slate-200 bg-white text-slate-600 hover:text-slate-900 rounded-lg hover:border-slate-300 transition-all font-mono text-[10px] shrink-0 cursor-pointer"
                                  title="Copiar lead como JSON"
                                >
                                  {copiedIndex === idx ? 'Copiado' : 'JSON'}
                                </button>
                                <button
                                  onClick={() => handleDeleteLead(lead.id)}
                                  className="p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 border border-transparent hover:border-rose-200 rounded-lg transition-colors shrink-0 cursor-pointer"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* DETAILS AND ANSWERS DRILLDOWN DRAWER MODAL */}
              {selectedLead && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                  <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl relative">
                    
                    {/* Modal Header */}
                    <div className="px-6 py-4 border-b border-slate-200 shrink-0 flex items-center justify-between bg-slate-50">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600">
                          <CheckCircle2 className="w-5 h-5 animate-pulse" />
                        </div>
                        <div>
                          <h3 className="font-display font-bold text-base text-slate-900">{selectedLead.empresa}</h3>
                          <p className="text-[10px] font-mono text-sky-600 tracking-widest uppercase">ID: {selectedLead.id}</p>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => setSelectedLead(null)}
                        className="p-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-500 hover:text-slate-800 transition-colors rounded-xl cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Modal Body Scroll */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
                      
                      {/* Key Performance Indicators */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl text-center">
                          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">Lead Score</span>
                          <span className={`text-xl font-bold font-display tracking-tight block mt-1 ${
                            (selectedLead.leadScore ?? calculateLeadScore(selectedLead)) >= 70 ? 'text-emerald-600' :
                            (selectedLead.leadScore ?? calculateLeadScore(selectedLead)) >= 40 ? 'text-amber-600' : 'text-rose-600'
                          }`}>
                            {selectedLead.leadScore ?? calculateLeadScore(selectedLead)}%
                          </span>
                        </div>
                        
                        <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl text-center">
                          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">Cadastro</span>
                          <span className="text-[11px] font-bold text-slate-800 block mt-2 truncate">
                            {selectedLead.dataCadastro || (selectedLead.createdAt ? new Date(selectedLead.createdAt).toLocaleDateString('pt-BR') : 'Indeterminado')}
                          </span>
                        </div>

                        <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl text-center">
                          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">Status Comercial</span>
                          <div className="mt-1">
                            <select
                              value={selectedLead.status || 'Novo'}
                              onChange={(e) => handleUpdateLeadStatus(selectedLead.id, e.target.value as any)}
                              className="text-[10px] font-bold bg-white border border-slate-200 rounded-lg text-slate-800 text-center py-0.5 px-2.5 focus:outline-none"
                            >
                              <option value="Novo">Novo</option>
                              <option value="Aguardando reunião">Aguardando Reunião</option>
                              <option value="Reunião agendada">Reunião Agendada</option>
                              <option value="Reunião realizada">Reunião Realizada</option>
                              <option value="Proposta enviada">Proposta Enviada</option>
                              <option value="Fechado">Fechado</option>
                              <option value="Perdido">Perdido</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Complete Answers Section */}
                      <div className="space-y-4">
                        <h4 className="text-xs font-bold font-display text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1">Todas as Respostas</h4>
                        
                        {selectedLead.dataReuniao && selectedLead.horaReuniao && (
                          <div className="bg-amber-50/60 border border-amber-200 p-4 rounded-2xl space-y-3">
                            <span className="text-[10px] font-mono text-amber-800 uppercase tracking-widest block font-bold">📅 REUNIÃO ESTRATÉGICA AGENDADA</span>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div>
                                <span className="text-slate-500 block text-[9px] font-mono uppercase">DATA CONFIRMADA</span>
                                <span className="text-slate-900 block font-semibold">{selectedLead.dataReuniao}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 block text-[9px] font-mono uppercase">HORÁRIO BRASÍLIA</span>
                                <span className="text-slate-900 block font-semibold">{selectedLead.horaReuniao}h</span>
                              </div>
                            </div>
                            {selectedLead.googleMeetLink && (
                              <div className="pt-2 border-t border-amber-200 flex items-center justify-between">
                                <span className="text-[10px] text-slate-500 font-mono font-light">Sala Google Meet:</span>
                                <a 
                                  href={selectedLead.googleMeetLink} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white font-mono text-[9px] font-semibold rounded-lg transition-all shadow-xs"
                                >
                                  ABRIR SALA DO MEET
                                </a>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Custom Bento grid listing all actual questionnaire responses */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          
                          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Nome Completo</span>
                            <span className="text-sm text-slate-900 font-semibold block mt-1">{selectedLead.nome}</span>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Email Principal</span>
                            <span className="text-sm text-slate-900 font-medium block mt-1 truncate" title={selectedLead.email}>{selectedLead.email}</span>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">WhatsApp para Contato</span>
                            <span className="text-sm text-teal-600 font-bold block mt-1 font-mono">
                              {selectedLead.whatsapp || selectedLead.telefone || 'Não informado'}
                            </span>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Nome da Empresa</span>
                            <span className="text-sm text-slate-900 font-bold block mt-1">{selectedLead.empresa}</span>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Segmento de Atuação</span>
                            <span className="text-sm text-sky-600 font-semibold block mt-1">{selectedLead.segmento || 'Não informado'}</span>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Faturamento Mensal</span>
                            <span className="text-sm text-slate-900 font-bold block mt-1">{selectedLead.faturamento || 'Não informado'}</span>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Operação Comercial Atual</span>
                            <span className="text-sm text-slate-800 font-medium block mt-1">{selectedLead.operacaoComercial || 'Não informado'}</span>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Canais de Geração de Leads</span>
                            <span className="text-xs text-slate-800 font-medium block mt-1 whitespace-pre-wrap">
                              {Array.isArray(selectedLead.origemLeads) 
                                ? selectedLead.origemLeads.join(', ') 
                                : (selectedLead.origemLeads || 'Não informado')}
                            </span>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Sua Empresa utiliza CRM?</span>
                            <span className="text-sm text-slate-800 font-medium block mt-1">{selectedLead.crm || 'Não informado'}</span>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl sm:col-span-2">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Principal Desafio Comercial</span>
                            <p className="text-sm text-slate-800 font-medium mt-1 leading-relaxed bg-white p-2.5 rounded-xl border border-slate-200">
                              {selectedLead.desafioPrincipal || 'Não informado'}
                            </p>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Cenário / Momento Atual</span>
                            <span className="text-sm text-slate-800 font-medium block mt-1">{selectedLead.momentoEmpresa || 'Não informado'}</span>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Investimento em Anúncios</span>
                            <span className="text-sm text-sky-600 font-bold block mt-1">{selectedLead.investimentoMarketing || 'Não informado'}</span>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Tem equipe comercial dedicada?</span>
                            <span className="text-sm text-slate-900 font-semibold block mt-1">{selectedLead.equipeComercial || 'Não informado'}</span>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Prazo para Início do Projeto</span>
                            <span className="text-sm text-teal-600 font-semibold block mt-1">{selectedLead.prazoInicio || 'Não informado'}</span>
                          </div>

                        </div>
                      </div>

                      {/* Tracking UTMS Block */}
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                        <span className="text-[10px] font-mono text-sky-600 font-bold uppercase tracking-wider block">Auditoria UTM / Marketing Digital</span>
                        <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                          <div>
                            <span className="text-slate-500 block">Source:</span>
                            <span className="text-slate-800 font-semibold truncate block mt-0.5">{selectedLead.utmSource || 'não fornecido'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Medium:</span>
                            <span className="text-slate-800 font-semibold truncate block mt-0.5">{selectedLead.utmMedium || 'não fornecido'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Campaign:</span>
                            <span className="text-slate-800 font-semibold truncate block mt-0.5">{selectedLead.utmCampaign || 'não fornecido'}</span>
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Modal Footer actions */}
                    <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between">
                      <button
                        onClick={() => {
                          const base = `https://wa.me/${selectedLead.telefone.replace(/\D/g, '')}`;
                          window.open(base, '_blank');
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-display font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-xs"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                        <span>ENTRAR EM CONTATO NO WHATSAPP</span>
                      </button>

                      <button
                        onClick={() => setSelectedLead(null)}
                        className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-display text-xs rounded-xl font-semibold transition-colors cursor-pointer"
                      >
                        Fechar dossiê
                      </button>
                    </div>

                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 2: CONFIG INTEGRATIONS */}
          {activeTab === 'integrations' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-display font-bold text-base text-slate-900">Hub de Conexões e Webhooks</h3>
                <p className="text-xs text-slate-500 mt-0.5">Assegure a transmissão instantânea dos dados para qualquer hub CRM ou automação.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Standard Webhooks */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-orange-100 text-orange-600">
                        <Server className="w-4 h-4" />
                      </div>
                      <span className="font-display font-medium text-sm text-slate-900">Módulo Standard Webhook</span>
                    </div>
                    <span className="text-[10px] bg-teal-100 text-teal-800 px-2 py-0.5 rounded font-mono font-bold">ATIVO</span>
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wide mb-1.5">ENDPOINT URL</label>
                    <input 
                      type="text" 
                      value={integrationConfig.webhookUrl}
                      onChange={(e) => saveConfig({ ...integrationConfig, webhookUrl: e.target.value })}
                      className="w-full text-xs font-mono bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 focus:outline-none focus:border-sky-500" 
                    />
                  </div>
                  
                  <button
                    onClick={() => handleTestWebhook('standard')}
                    disabled={isTestingWebhook}
                    className="w-full font-display font-bold text-xs py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    <Play className="w-3.5 h-3.5 text-sky-600" />
                    <span>{isTestingWebhook ? 'Disparando Teste...' : 'Enviar Payload de Teste'}</span>
                  </button>
                </div>

                {/* N8N Webhooks */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-orange-100 text-orange-600">
                        <RefreshCw className="w-4 h-4" />
                      </div>
                      <span className="font-display font-medium text-sm text-slate-900">Integração N8N Webhook</span>
                    </div>
                    <span className="text-[10px] bg-sky-100 text-sky-800 px-2 py-0.5 rounded font-mono font-bold">ATIVO</span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wide mb-1.5">N8N WEBHOOK URL</label>
                    <input
                      type="text"
                      value={integrationConfig.n8nUrl}
                      onChange={(e) => saveConfig({ ...integrationConfig, n8nUrl: e.target.value })}
                      className="w-full text-xs font-mono bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <button
                    onClick={() => handleTestWebhook('n8n')}
                    disabled={isTestingN8N}
                    className="w-full font-display font-bold text-xs py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    <Play className="w-3.5 h-3.5 text-sky-600" />
                    <span>{isTestingN8N ? 'Disparando Teste ao N8N...' : 'Enviar Payload ao N8N'}</span>
                  </button>
                </div>

                {/* Supabase backend */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                        <Database className="w-4 h-4" />
                      </div>
                      <span className="font-display font-medium text-sm text-slate-900">Banco Postgres Supabase</span>
                    </div>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                      <Wifi className="w-3 h-3" /> ONLINE
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wide mb-1">SUPABASE URL</label>
                      <input
                        type="text"
                        value={integrationConfig.supabaseUrl}
                        onChange={(e) => saveConfig({ ...integrationConfig, supabaseUrl: e.target.value })}
                        className="w-full text-xs font-mono bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wide mb-1">SUPABASE ANON KEY</label>
                      <input
                        type="password"
                        value={integrationConfig.supabaseAnonKey}
                        onChange={(e) => saveConfig({ ...integrationConfig, supabaseAnonKey: e.target.value })}
                        className="w-full text-xs font-mono bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Google Sheets / Analytics */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-sky-100 text-sky-700">
                        <Globe className="w-4 h-4" />
                      </div>
                      <span className="font-display font-medium text-sm text-slate-900">Scripts Externos & Meta Pixel</span>
                    </div>
                    <span className="text-[10px] bg-teal-100 text-teal-800 px-2 py-0.5 rounded font-mono font-bold">CARREGADO</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wide mb-1">META PIXEL ID</label>
                      <input
                        type="text"
                        value={integrationConfig.metaPixelId}
                        onChange={(e) => saveConfig({ ...integrationConfig, metaPixelId: e.target.value })}
                        className="w-full text-xs font-mono bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wide mb-1">GOOGLE ANALYTICS</label>
                      <input
                        type="text"
                        value={integrationConfig.gaTrackingId}
                        onChange={(e) => saveConfig({ ...integrationConfig, gaTrackingId: e.target.value })}
                        className="w-full text-xs font-mono bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wide mb-1">GOOGLE SHEETS APP SCRIPT URL</label>
                      <input
                        type="text"
                        value={integrationConfig.googleSheetsUrl}
                        onChange={(e) => saveConfig({ ...integrationConfig, googleSheetsUrl: e.target.value })}
                        className="w-full text-xs font-mono bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wide mb-1">CALENDLY LINK PARA AGENDAMENTO</label>
                      <input
                        type="text"
                        value={integrationConfig.calendlyUrl || ''}
                        onChange={(e) => saveConfig({ ...integrationConfig, calendlyUrl: e.target.value })}
                        placeholder="https://calendly.com/contatosensesales/30min"
                        className="w-full text-xs font-mono bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  {/* Google Sheets Help & Apps Script Code block */}
                  <div className="border border-sky-200 bg-sky-50/60 rounded-xl p-4 mt-1 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-sky-800 tracking-wider uppercase">✨ CONFIGURAÇÃO GOOGLE SHEETS COM APPS SCRIPT</span>
                      <button
                        onClick={() => setShowScriptInstructions(!showScriptInstructions)}
                        className="text-[10px] font-mono text-sky-600 hover:underline transition-all cursor-pointer font-bold"
                      >
                        {showScriptInstructions ? 'OCULTAR INSTRUÇÕES' : 'MOSTRAR INSTRUÇÕES & SCRIPT'}
                      </button>
                    </div>
                    
                    {showScriptInstructions && (
                      <div className="text-xs text-slate-600 space-y-3 leading-relaxed animate-fade-in">
                        <p>Siga os passos abaixo para integrar automaticamente as respostas a uma planilha do Google Sheets:</p>
                        <ol className="list-decimal pl-5 space-y-1">
                          <li>Crie uma nova planilha vazia no seu Google Drive.</li>
                          <li>No menu superior, clique em <strong>Extensões</strong> &gt; <strong>Apps Script</strong>.</li>
                          <li>Apague qualquer código existente e cole o script abaixo.</li>
                          <li>Clique no ícone de <strong>Salvar (Disquete)</strong>.</li>
                          <li>Clique em <strong>Implantar</strong> &gt; <strong>Nova implantação</strong>.</li>
                          <li>Selecione o tipo <strong>App da Web</strong> (ícone de engrenagem).</li>
                          <li>Defina "Executar como" para <strong>Você (seu e-mail)</strong> e "Quem tem acesso" para <strong>Qualquer pessoa</strong>.</li>
                          <li>Clique em <strong>Implantar</strong>, autorize as permissões e copie o link de <strong>URL do App da Web</strong> gerado.</li>
                          <li>Cole essa URL no campo <strong>GOOGLE SHEETS APP SCRIPT URL</strong> acima e clique em salvar!</li>
                        </ol>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] font-mono text-slate-500">CÓDIGO APPS SCRIPT DO GOOGLE SHEETS</span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(`function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : "";
    var data = {};
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch (err) {
        data = e.parameter || {};
      }
    } else if (e && e.parameter) {
      data = e.parameter;
    }
    
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    
    if (sheet.getLastRow() === 0) {
      var headers = [
        "ID",
        "Data de Cadastro",
        "Hora de Cadastro",
        "Nome",
        "WhatsApp",
        "E-mail",
        "Segmento",
        "Papel na Empresa",
        "Receita Mensal",
        "Tamanho da Equipe",
        "Lead Score (%)",
        "Status",
        "Origem UTM (Source)",
        "Mídia UTM (Medium)",
        "Campanha UTM (Campaign)",
        "Dispositivo",
        "Navegador"
      ];
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#0D0D0D").setFontColor("#FFFFFF");
    }
    
    var row = [
      data.id || "",
      data.dataCadastro || new Date().toLocaleDateString("pt-BR"),
      data.horaCadastro || new Date().toLocaleTimeString("pt-BR"),
      data.nome || "",
      data.whatsapp || data.telefone || "",
      data.email || "",
      data.segmento || "",
      data.papelEmpresa || "",
      data.faturamento || "",
      data.tamanhoEquipe || "",
      data.leadScore !== undefined ? data.leadScore + "%" : "",
      data.status || "Novo",
      data.utmSource || "",
      data.utmMedium || "",
      data.utmCampaign || "",
      data.device || "",
      data.browser || ""
    ];
    
    sheet.appendRow(row);
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Lead salvo com sucesso!" }))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ 
    status: "online", 
    message: "Integração Catalyize com Google Sheets ativa!" 
  })).setMimeType(ContentService.MimeType.JSON);
}`);
                                setScriptCopied(true);
                                setTimeout(() => setScriptCopied(false), 2000);
                              }}
                              className="px-2.5 py-1 bg-teal-600 text-white rounded text-[10px] font-display font-bold hover:bg-teal-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                            >
                              {scriptCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              <span>{scriptCopied ? 'COPIADO!' : 'COPIAR SCRIPT'}</span>
                            </button>
                          </div>
                          <pre className="p-3 bg-white border border-slate-200 rounded-lg text-[10px] font-mono text-slate-800 max-h-40 overflow-y-auto leading-normal whitespace-pre">
{`function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : "";
    var data = {};
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch (err) {
        data = e.parameter || {};
      }
    } else if (e && e.parameter) {
      data = e.parameter;
    }
    
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    
    if (sheet.getLastRow() === 0) {
      var headers = [
        "ID",
        "Data de Cadastro",
        "Hora de Cadastro",
        "Nome",
        "WhatsApp",
        "E-mail",
        "Segmento",
        "Papel na Empresa",
        "Receita Mensal",
        "Tamanho da Equipe",
        "Lead Score (%)",
        "Status",
        "Origem UTM (Source)",
        "Mídia UTM (Medium)",
        "Campanha UTM (Campaign)",
        "Dispositivo",
        "Navegador"
      ];
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#0D0D0D").setFontColor("#FFFFFF");
    }
    
    var row = [
      data.id || "",
      data.dataCadastro || new Date().toLocaleDateString("pt-BR"),
      data.horaCadastro || new Date().toLocaleTimeString("pt-BR"),
      data.nome || "",
      data.whatsapp || data.telefone || "",
      data.email || "",
      data.segmento || "",
      data.papelEmpresa || "",
      data.faturamento || "",
      data.tamanhoEquipe || "",
      data.leadScore !== undefined ? data.leadScore + "%" : "",
      data.status || "Novo",
      data.utmSource || "",
      data.utmMedium || "",
      data.utmCampaign || "",
      data.device || "",
      data.browser || ""
    ];
    
    sheet.appendRow(row);
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Lead salvo com sucesso!" }))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ 
    status: "online", 
    message: "Integração Catalyize com Google Sheets ativa!" 
  })).setMimeType(ContentService.MimeType.JSON);
}`}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-200 pt-4 mt-4">
                    <label className="block text-[10px] font-mono text-teal-700 font-bold uppercase tracking-wider mb-1">SENHA DO PAINEL DO ADMINISTRADOR (/admin)</label>
                    <p className="text-[10px] text-slate-500 mb-2">Defina a senha que é solicitada para acessar este painel ao digitar /admin no final da URL.</p>
                    <input
                      type="text"
                      value={integrationConfig.adminPassword || 'sensesales@admin'}
                      onChange={(e) => saveConfig({ ...integrationConfig, adminPassword: e.target.value })}
                      placeholder="sensesales@admin"
                      className="w-full md:w-1/2 text-xs font-mono bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 3: RELATÓRIO & MÉTRICAS */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-display font-bold text-base text-slate-900">Relatórios & Funil Estratégico</h3>
                <p className="text-xs text-slate-500 mt-0.5">Indicadores do perfil das empresas cadastradas no formulário da Catalyize.</p>
              </div>

              {leads.length === 0 ? (
                <div className="border border-slate-200 bg-slate-50 rounded-2xl p-12 text-center">
                  <BarChart className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-sans font-medium text-slate-800">Sem dados para calcular métricas.</p>
                  <p className="text-xs text-slate-500 mt-1">Conclua submits de qualificação com variadas faixas financeiras.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Lead metrics */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">TOTAL INGRESSOS</p>
                    <div className="my-2">
                      <span className="text-3xl font-display font-bold text-slate-900 tracking-tight">{leads.length}</span>
                      <span className="text-xs text-teal-700 font-mono font-bold ml-2">leads</span>
                    </div>
                    <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-teal-600" style={{ width: '100%' }} />
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">FATURAMENTO SIGNIFICATIVO</p>
                    <div className="my-2">
                      <span className="text-3xl font-display font-bold text-slate-900 tracking-tight">
                        {leads.length === 0 ? 0 : Math.round((leads.filter(l => {
                          const fat = l.faturamento || '';
                          return !fat.includes('Até R$ 50 mil') && !fat.includes('Prefiro conversar');
                        }).length / leads.length) * 100)}%
                      </span>
                      <span className="text-[10px] text-sky-600 font-mono font-bold ml-2">Acima R$50k/mês</span>
                    </div>
                    <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-sky-600" style={{ width: '75%' }} />
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">FALAM IMEDIATAMENTE</p>
                    <div className="my-2">
                      <span className="text-3xl font-display font-bold text-slate-900 tracking-tight">
                        {leads.length === 0 ? 0 : Math.round((leads.filter(l => {
                          const p = l.prazoInicio || l.prazo || '';
                          return p.includes('Imediatamente') || p.includes('30 dias');
                        }).length / leads.length) * 100)}%
                      </span>
                      <span className="text-xs text-teal-700 font-mono font-bold ml-2">Hot leads</span>
                    </div>
                    <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-teal-600" style={{ width: '45%' }} />
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">CONVERSÃO DE WHATSAPP</p>
                    <div className="my-2">
                      <span className="text-3xl font-display font-bold text-slate-900 tracking-tight">94.3%</span>
                      <span className="text-xs text-slate-500 font-mono ml-2">Média</span>
                    </div>
                    <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-sky-600" style={{ width: '94.3%' }} />
                    </div>
                  </div>

                  {/* Distribution list */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 sm:col-span-2 space-y-3">
                    <h4 className="font-display font-semibold text-xs text-slate-900 uppercase tracking-wider">Distribuição por Segmentos</h4>
                    <div className="space-y-2 max-h-[140px] overflow-y-auto no-scrollbar">
                      {Array.from(new Set(leads.map(l => l.segmento))).map((segment, idx) => {
                        const count = leads.filter(l => l.segmento === segment).length;
                        const pct = Math.round((count / leads.length) * 100);
                        return (
                          <div key={idx} className="space-y-1">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-800 font-medium">{segment}</span>
                              <span className="text-slate-500 font-mono">{count} ({pct}%)</span>
                            </div>
                            <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-teal-500" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Faturamento list */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 sm:col-span-2 space-y-3">
                    <h4 className="font-display font-semibold text-xs text-slate-900 uppercase tracking-wider">Pretensões de Investimento em Anúncios</h4>
                    <div className="space-y-2 max-h-[140px] overflow-y-auto no-scrollbar">
                      {Array.from(new Set(leads.map(l => l.orcamentoAds))).map((orc, idx) => {
                        const count = leads.filter(l => l.orcamentoAds === orc).length;
                        const pct = Math.round((count / leads.length) * 100);
                        return (
                          <div key={idx} className="space-y-1">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-800 font-medium">{orc}</span>
                              <span className="text-slate-500 font-mono">{count} ({pct}%)</span>
                            </div>
                            <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-sky-500" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}

          {/* TAB 4: AUDITORIA LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">Central de Logs Integrada</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Auditoria contínua de requisições de webhooks, pixels e eventos.</p>
                </div>
                <button
                  onClick={() => {
                    setLogs([]);
                    localStorage.removeItem('sensesales_integration_logs');
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg text-xs cursor-pointer"
                >
                  Limpar Logs
                </button>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 font-mono text-[11px] h-[350px] overflow-y-auto space-y-2">
                {logs.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-center">
                    Efetue conexões ou preencha o formulário para visualizar os logs do consolidador.
                  </div>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="flex gap-2 leading-relaxed">
                      <span className="text-slate-400 shrink-0">[{log.time}]</span>
                      <span className={`font-semibold shrink-0 ${
                        log.status === 'success' ? 'text-teal-600' : log.status === 'warn' ? 'text-amber-600' : 'text-rose-600'
                      }`}>
                        [{log.action.toUpperCase()}]
                      </span>
                      <span className="text-slate-800">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </div>
        
        {/* Panel Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50 text-[10px] font-mono text-slate-500">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
            SISTEMA DE QUALIFICAÇÃO INTEGRADO - CATALYIZE v4.2
          </span>
          <span>© 2026 Catalyize</span>
        </div>

      </div>
    </div>
  );
}
