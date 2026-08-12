import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowRight, ArrowLeft, Send, Sparkles, Check, ChevronRight, 
  HelpCircle, Eye, ShieldCheck, Settings, Globe, PhoneCall, AlertTriangle, Play,
  Calendar, Video, Lock
} from 'lucide-react';
import { 
  QUESTIONS_LIST, INITIAL_LEAD_DATA, maskPhone, validateEmail, 
  validatePhone, buildWhatsAppMessage, DEFAULT_INTEGRATIONS_CONFIG, calculateLeadScore 
} from './data';
import { LeadData, Question, IntegrationConfig } from './types';
import { createClient } from '@supabase/supabase-js';
import LoaderStep from './components/LoaderStep';
import LeadSummary from './components/LeadSummary';
import AdminPanel from './components/AdminPanel';
import BookingCalendar from './components/BookingCalendar';

export default function App() {
  const [lead, setLead] = useState<LeadData>(INITIAL_LEAD_DATA);
  const [currentStep, setCurrentStep] = useState<number>(0); // 0 = Welcome screen, 1+ = Questions
  const [inputValue, setInputValue] = useState<string>('');
  const [checkboxValue, setCheckboxValue] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  
  // Booking/Scheduling States
  const [bookedMeeting, setBookedMeeting] = useState<{ date: string; hour: string; meetLink: string } | null>(null);
  const [showBookingStep, setShowBookingStep] = useState<boolean>(false);

  // Admin and Password-protection State fields
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('sensesales_admin_logged_in') === 'true';
  });
  const [adminLoginError, setAdminLoginError] = useState<string | null>(null);

  const [deviceInfo, setDeviceInfo] = useState({ os: 'Unknown', browser: 'Unknown' });

  // Input ref to auto focus
  const inputRef = useRef<HTMLInputElement>(null);

  // Parse UTM params and device info on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const utm_source = params.get('utm_source') || params.get('src') || '';
    const utm_medium = params.get('utm_medium') || '';
    const utm_campaign = params.get('utm_campaign') || '';

    // Simple UserAgent detection for tracking
    const ua = navigator.userAgent;
    let browser = 'Other';
    let os = 'Other';
    if (ua.indexOf('Chrome') > -1) browser = 'Chrome';
    else if (ua.indexOf('Firefox') > -1) browser = 'Firefox';
    else if (ua.indexOf('Safari') > -1) browser = 'Safari';

    if (ua.indexOf('Windows') > -1) os = 'Windows';
    else if (ua.indexOf('Mac') > -1) os = 'macOS';
    else if (ua.indexOf('Android') > -1) os = 'Android';
    else if (ua.indexOf('iPhone') > -1) os = 'iOS';

    setDeviceInfo({ os, browser });

    setLead(prev => ({
      ...prev,
      utmSource: utm_source || undefined,
      utmMedium: utm_medium || undefined,
      utmCampaign: utm_campaign || undefined,
      device: os,
      browser: browser
    }));
  }, []);

  // Listen to path changes and hashes to support /admin and #admin routing cleanly
  useEffect(() => {
    const handleLocationRouting = () => {
      const pathSuffix = window.location.pathname;
      const hashVal = window.location.hash;
      if (pathSuffix.endsWith('/admin') || hashVal === '#admin') {
        setIsAdminRoute(true);
      } else {
        setIsAdminRoute(false);
      }
    };

    handleLocationRouting();
    window.addEventListener('hashchange', handleLocationRouting);
    
    // Periodically inspect pathname in case dynamic navigation occurs
    const interval = setInterval(handleLocationRouting, 1000);

    return () => {
      window.removeEventListener('hashchange', handleLocationRouting);
      clearInterval(interval);
    };
  }, []);

  // Filter visible questions dynamically based on dependencies
  const visibleQuestions: Question[] = QUESTIONS_LIST.filter(q => {
    if (!q.dependsOn) return true;
    const parentVal = lead[q.dependsOn.variable];
    return parentVal === q.dependsOn.value;
  });

  const totalQuestionsCount = visibleQuestions.length;
  const currentQuestion: Question | undefined = currentStep > 0 ? visibleQuestions[currentStep - 1] : undefined;

  // Sync draft inputs when question changes
  useEffect(() => {
    if (currentQuestion) {
      const activeVariable = currentQuestion.variable;
      if (currentQuestion.type === 'checkbox') {
        setCheckboxValue(lead[activeVariable] as boolean || false);
      } else if (currentQuestion.type === 'multiselect') {
        if (!Array.isArray(lead[activeVariable])) {
          setLead(prev => ({
            ...prev,
            [activeVariable]: []
          }));
        }
        setInputValue('');
      } else {
        setInputValue((lead[activeVariable] as string) || '');
      }
      setValidationError(null);

      // Auto-focus input for smoother UX
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 50);
    }
  }, [currentStep, currentQuestion]);

  // Handle WhatsApp Brazilian Formatter
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (currentQuestion?.type === 'tel') {
      value = maskPhone(value);
    }
    setInputValue(value);
    if (validationError) setValidationError(null);
  };

  // Validate current answer
  const validateCurrentAnswer = (): boolean => {
    if (!currentQuestion) return true;

    if (currentQuestion.type === 'checkbox') {
      if (!checkboxValue && currentQuestion.required) {
        setValidationError('Você precisa aceitar os termos de consentimento para continuar.');
        return false;
      }
      return true;
    }

    if (currentQuestion.type === 'multiselect') {
      const selectedArr = lead[currentQuestion.variable];
      if (currentQuestion.required && (!Array.isArray(selectedArr) || selectedArr.length === 0)) {
        setValidationError('Por favor, selecione pelo menos uma opção para darmos prosseguimento.');
        return false;
      }
      return true;
    }

    const trimmedValue = inputValue.trim();

    if (currentQuestion.required && !trimmedValue) {
      setValidationError('Este campo é obrigatório para darmos prosseguimento.');
      return false;
    }

    if (trimmedValue && currentQuestion.type === 'email') {
      if (!validateEmail(trimmedValue)) {
        setValidationError('Por favor, insira um endereço de e-mail válido.');
        return false;
      }
    }

    if (trimmedValue && currentQuestion.type === 'tel') {
      if (!validatePhone(trimmedValue)) {
        setValidationError('Insira um número de WhatsApp com DDD válido. Ex: (11) 99999-9999.');
        return false;
      }
    }

    return true;
  };

  // Move forward
  const handleNext = () => {
    if (!validateCurrentAnswer()) return;

    // Save answer to state
    if (currentQuestion) {
      const activeVariable = currentQuestion.variable;
      if (currentQuestion.type === 'checkbox') {
        setLead(prev => ({
          ...prev,
          [activeVariable]: checkboxValue
        }));
      } else if (currentQuestion.type === 'multiselect') {
        // MULTISELECT fields are updated incrementally via handleMultiSelectToggle!
      } else {
        const finalValue = inputValue.trim();
        setLead(prev => ({
          ...prev,
          [activeVariable]: finalValue
        }));
      }
    }

    // Determine path forward
    if (currentStep <= totalQuestionsCount) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleContactSubmit();
    }
  };

  const REDIRECT_THANK_YOU_URL = 'https://obrigadocatalyize.sensesales.com.br';
  const pendingSaveRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (isProcessing && !pendingSaveRef.current) {
      pendingSaveRef.current = saveLeadToDatabase();
    }
  }, [isProcessing]);

  const executeRedirect = () => {
    try {
      window.location.replace(REDIRECT_THANK_YOU_URL);
    } catch (e) {
      console.warn('Replace redirect failed:', e);
    }

    try {
      window.location.href = REDIRECT_THANK_YOU_URL;
    } catch (e) {
      console.warn('Location href failed:', e);
    }

    try {
      window.open(REDIRECT_THANK_YOU_URL, '_self');
    } catch (e) {
      console.warn('Window open failed:', e);
    }
  };

  useEffect(() => {
    if (isCompleted) {
      executeRedirect();
    }
  }, [isCompleted]);

  // Triggered when loader finishes (2 seconds)
  const handleLoaderComplete = async () => {
    if (pendingSaveRef.current) {
      try {
        await pendingSaveRef.current;
      } catch (e) {
        console.error('Save lead error:', e);
      }
    }
    setIsProcessing(false);
    setIsCompleted(true);
    executeRedirect();
  };

  // Save lead details and trigger webhooks
  const saveLeadToDatabase = async () => {
    const now = new Date();
    const dataCadastro = now.toLocaleDateString('pt-BR');
    const horaCadastro = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const score = calculateLeadScore(lead);

    const finalLead: LeadData = {
      ...lead,
      id: 'L-' + Math.floor(100000 + Math.random() * 900000),
      createdAt: now.toISOString(),
      status: 'Novo',
      leadScore: score,
      dataCadastro,
      horaCadastro,
      device: typeof window !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
      browser: typeof window !== 'undefined' ? (navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Safari') ? 'Safari' : 'Outro') : 'Outro'
    };

    setLead(finalLead);

    // Save locally
    const existingLeadsRaw = localStorage.getItem('sensesales_leads');
    const existingLeads: LeadData[] = existingLeadsRaw ? JSON.parse(existingLeadsRaw) : [];
    localStorage.setItem('sensesales_leads', JSON.stringify([finalLead, ...existingLeads]));

    // Log tracking
    const existingLogsRaw = localStorage.getItem('sensesales_integration_logs');
    const existingLogs = existingLogsRaw ? JSON.parse(existingLogsRaw) : [];
    
    const timestamp = now.toLocaleTimeString();
    const newLogs: { id: string; time: string; action: string; status: 'success' | 'warn' | 'error'; message: string }[] = [
      { id: Math.random().toString(), time: timestamp, action: 'Lead Local', status: 'success' as const, message: `Lead de ${finalLead.nome} (${finalLead.empresa}) registrado com sucesso.` },
      { id: Math.random().toString(), time: timestamp, action: 'Meta Pixel', status: 'success' as const, message: `Evento "Lead" enviado com ID: ${finalLead.id}.` },
      { id: Math.random().toString(), time: timestamp, action: 'Webhooks', status: 'warn' as const, message: `Iniciando disparo assíncrono para os servidores cadastrados.` }
    ];

    // Fire off to webhooks
    triggerWebhooks(finalLead);

    // Load and sanitize integrations config
    let config: IntegrationConfig = DEFAULT_INTEGRATIONS_CONFIG;
    const storedConfig = localStorage.getItem('sensesales_integrations_config');
    if (storedConfig) {
      try {
        config = JSON.parse(storedConfig);
        if (!config.googleSheetsUrl || 
            config.googleSheetsUrl.includes('docs.google.com/spreadsheets') || 
            config.googleSheetsUrl.includes('AKfycbzi') ||
            config.googleSheetsUrl.includes('AKfycbwz') ||
            !config.googleSheetsUrl.includes('script.google.com')) {
          config.googleSheetsUrl = DEFAULT_INTEGRATIONS_CONFIG.googleSheetsUrl;
          localStorage.setItem('sensesales_integrations_config', JSON.stringify(config));
        }
      } catch (err) {}
    } else {
      localStorage.setItem('sensesales_integrations_config', JSON.stringify(DEFAULT_INTEGRATIONS_CONFIG));
    }

    const isSupabaseConfigured = config.supabaseUrl && 
      config.supabaseUrl !== 'https://xyz.supabase.co' && 
      config.supabaseAnonKey && 
      config.supabaseAnonKey !== 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9...';

    if (isSupabaseConfigured) {
      try {
        const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
        
        const { error } = await supabase
          .from('leads')
          .insert([
            {
              id: finalLead.id,
              nome: finalLead.nome,
              whatsapp: finalLead.whatsapp,
              email: finalLead.email,
              empresa: finalLead.empresa,
              segmento: finalLead.segmento,
              faturamento: finalLead.faturamento,
              operacaoComercial: finalLead.operacaoComercial,
              origemLeads: finalLead.origemLeads,
              crm: finalLead.crm,
              desafioPrincipal: finalLead.desafioPrincipal,
              momentoEmpresa: finalLead.momentoEmpresa,
              investimentoMarketing: finalLead.investimentoMarketing,
              equipeComercial: finalLead.equipeComercial,
              prazoInicio: finalLead.prazoInicio,
              createdAt: finalLead.createdAt,
              
              // Fallback fields for backwards integration support
              telefone: finalLead.whatsapp || '',
              data_cadastro: dataCadastro,
              hora_cadastro: horaCadastro,
              utm_source: finalLead.utmSource || '',
              utm_medium: finalLead.utmMedium || '',
              utm_campaign: finalLead.utmCampaign || '',
              lead_score: score,
              status: 'Novo'
            }
          ]);

        if (error) {
          throw error;
        }

        newLogs.push({
          id: Math.random().toString(),
          time: timestamp,
          action: 'Supabase',
          status: 'success' as const,
          message: `Salvo no banco de dados Supabase com sucesso na tabela "leads".`
        });
      } catch (err: any) {
        console.error('Erro ao salvar no Supabase:', err);
        newLogs.push({
          id: Math.random().toString(),
          time: timestamp,
          action: 'Supabase',
          status: 'error' as const,
          message: `Erro ao salvar no Supabase: ${err.message || err.details || 'Tabela "leads" ou credenciais inválidas'}`
        });
      }
    } else {
      newLogs.push({
        id: Math.random().toString(),
        time: timestamp,
        action: 'Supabase',
        status: 'warn' as const,
        message: `Não enviado: Supabase não está configurado com credenciais válidas.`
      });
    }

    // Google Sheets Integration
    const targetSheetsUrl = config.googleSheetsUrl || DEFAULT_INTEGRATIONS_CONFIG.googleSheetsUrl;
    if (targetSheetsUrl && targetSheetsUrl.includes('script.google.com')) {
      try {
        const payloadStr = JSON.stringify(finalLead);

        // Send via sendBeacon (background transfer guaranteed on redirect)
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
          try {
            const blob = new Blob([payloadStr], { type: 'text/plain;charset=UTF-8' });
            navigator.sendBeacon(targetSheetsUrl, blob);
          } catch (e) {
            console.warn('sendBeacon warning:', e);
          }
        }

        // Send via fetch with keepalive
        await fetch(targetSheetsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: payloadStr,
          mode: 'no-cors',
          keepalive: true
        });

        newLogs.push({
          id: Math.random().toString(),
          time: timestamp,
          action: 'Google Sheets',
          status: 'success' as const,
          message: `Lead de ${finalLead.nome} enviado para a planilha Google Sheets com sucesso via Apps Script.`
        });
      } catch (err: any) {
        console.error('Erro ao enviar para Google Sheets:', err);
        newLogs.push({
          id: Math.random().toString(),
          time: timestamp,
          action: 'Google Sheets',
          status: 'error' as const,
          message: `Erro ao enviar para Google Sheets: ${err.message || 'Erro de conexão'}`
        });
      }
    } else {
      newLogs.push({
        id: Math.random().toString(),
        time: timestamp,
        action: 'Google Sheets',
        status: 'warn' as const,
        message: `Google Sheets não integrado ou URL inválida (deve ser um link de Web App do Apps Script).`
      });
    }

    localStorage.setItem('sensesales_integration_logs', JSON.stringify([...newLogs, ...existingLogs].slice(0, 50)));
  };

  const triggerWebhooks = async (finalLead: LeadData) => {
    // Collect settings
    let config: IntegrationConfig = DEFAULT_INTEGRATIONS_CONFIG;
    const storedConfig = localStorage.getItem('sensesales_integrations_config');
    if (storedConfig) {
      try {
        config = JSON.parse(storedConfig);
      } catch (err) {}
    }

    const payload = {
      event: 'lead.qualified',
      timestamp: new Date().toISOString(),
      lead: finalLead
    };

    // Standard webhook send
    if (config.webhookUrl) {
      try {
        await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          mode: 'no-cors',
          keepalive: true
        });
      } catch (e) {}
    }

    // N8N send
    if (config.n8nUrl) {
      try {
        await fetch(config.n8nUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          mode: 'no-cors',
          keepalive: true
        });
      } catch (e) {}
    }
  };

  // Move backward
  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
      setValidationError(null);
    }
  };

  // Handle choice selection with auto-advance!
  const handleOptionSelect = (option: string) => {
    if (currentQuestion) {
      setLead(prev => ({
        ...prev,
        [currentQuestion.variable]: option
      }));
      
      // Auto-advance to next question or contact step (step 5)
      setTimeout(() => {
        if (currentStep <= totalQuestionsCount) {
          setCurrentStep(prev => prev + 1);
        }
      }, 250);
    }
  };

  const handleContactSubmit = () => {
    if (!lead.nome || !lead.nome.trim()) {
      setValidationError('Por favor, preencha seu nome completo.');
      return;
    }
    if (!lead.email || !validateEmail(lead.email.trim())) {
      setValidationError('Por favor, insira um e-mail válido.');
      return;
    }
    if (!lead.whatsapp || !validatePhone(lead.whatsapp.trim())) {
      setValidationError('Insira um telefone de WhatsApp válido com DDD.');
      return;
    }
    if (!lead.lgpd) {
      setValidationError('Você precisa autorizar o tratamento dos dados para continuar.');
      return;
    }

    setValidationError(null);
    setIsProcessing(true);
    pendingSaveRef.current = saveLeadToDatabase();
  };

  // Handle multi-select choice toggling (no auto-advance allowed!)
  const handleMultiSelectToggle = (option: string) => {
    if (currentQuestion) {
      const variable = currentQuestion.variable;
      const currentSelected = Array.isArray(lead[variable]) 
        ? (lead[variable] as string[]) 
        : [];
      
      let updatedSelected: string[];
      if (currentSelected.includes(option)) {
        updatedSelected = currentSelected.filter(val => val !== option);
      } else {
        updatedSelected = [...currentSelected, option];
      }

      setLead(prev => ({
        ...prev,
        [variable]: updatedSelected
      }));
      setValidationError(null);
    }
  };

  // Intercept Keydown
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (currentStep === 5) {
        handleContactSubmit();
      } else {
        handleNext();
      }
    }
  };

  // Calculates visible progress across 5 steps (4 questions + contact step)
  const totalStepsCount = 5;
  const progressPercent = currentStep === 0 
    ? 0 
    : Math.round((currentStep / totalStepsCount) * 100);

  // Opens target sales WhatsApp
  const handleSpeakWithSpecialist = () => {
    const encodedMessage = buildWhatsAppMessage(lead);
    const link = `https://wa.me/5521972736030?text=${encodedMessage}`;
    
    // Log WhatsApp redirect audit
    const existingLogsRaw = localStorage.getItem('sensesales_integration_logs');
    const existingLogs = existingLogsRaw ? JSON.parse(existingLogsRaw) : [];
    const newLog = { 
      id: Math.random().toString(), 
      time: new Date().toLocaleTimeString(), 
      action: 'WhatsApp API', 
      status: 'success' as const, 
      message: `Lead iniciando contato direto no WhatsApp comercial.` 
    };
    localStorage.setItem('sensesales_integration_logs', JSON.stringify([newLog, ...existingLogs].slice(0, 50)));

    window.open(link, '_blank');
  };

  // Handles meeting scheduling callback from BookingCalendar
  const handleBookingComplete = async (date: string, hour: string, meetLink: string) => {
    // 1. Format date safely
    let formattedDate = date;
    if (date && date.includes('-')) {
      const parts = date.split('-');
      if (parts.length === 3) {
        formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }

    // 2. Set scheduled meeting credentials
    setBookedMeeting({ date, hour, meetLink });
    setShowBookingStep(false);

    // 3. Update active lead state
    let finalLead: LeadData = { ...lead };
    setLead(prev => {
      const updated = {
        ...prev,
        dataReuniao: formattedDate,
        horaReuniao: hour,
        googleMeetLink: meetLink,
        status: 'Reunião agendada' as const
      };
      finalLead = updated;
      return updated;
    });

    // 4. Update locally persisted leads lists
    const existingLeadsRaw = localStorage.getItem('sensesales_leads');
    if (existingLeadsRaw) {
      try {
        const existingLeads: LeadData[] = JSON.parse(existingLeadsRaw);
        const updatedLeads = existingLeads.map(l => l.id === lead.id ? {
          ...l,
          dataReuniao: formattedDate,
          horaReuniao: hour,
          googleMeetLink: meetLink,
          status: 'Reunião agendada' as const
        } : l);
        localStorage.setItem('sensesales_leads', JSON.stringify(updatedLeads));
      } catch (err) {
        console.error('Error updating local storage leads list:', err);
      }
    }

    // 5. Update supabase registry row if configured
    let config: IntegrationConfig = DEFAULT_INTEGRATIONS_CONFIG;
    const storedConfig = localStorage.getItem('sensesales_integrations_config');
    if (storedConfig) {
      try {
        config = JSON.parse(storedConfig);
      } catch (err) {}
    }

    const isSupabaseConfigured = config.supabaseUrl && 
      config.supabaseUrl !== 'https://xyz.supabase.co' && 
      config.supabaseAnonKey && 
      config.supabaseAnonKey !== 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9...';

    if (isSupabaseConfigured) {
      const activeId = lead.id || finalLead.id;
      try {
        const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
        const { error } = await supabase
          .from('leads')
          .update({
            data_reuniao: formattedDate,
            hora_reuniao: hour,
            google_meet_link: meetLink,
            status: 'Reunião agendada'
          })
          .eq('id', activeId);

        if (error) throw error;

        // Sync Audit Log
        const existingLogsRaw = localStorage.getItem('sensesales_integration_logs');
        const existingLogs = existingLogsRaw ? JSON.parse(existingLogsRaw) : [];
        const newLog = { 
          id: Math.random().toString(), 
          time: new Date().toLocaleTimeString(), 
          action: 'Supabase Update', 
          status: 'success' as const, 
          message: `Lead ${activeId} atualizado para status "Reunião agendada" no Supabase.` 
        };
        localStorage.setItem('sensesales_integration_logs', JSON.stringify([newLog, ...existingLogs].slice(0, 50)));
      } catch (err: any) {
        console.error('Error updating supabase event details:', err);
        const existingLogsRaw = localStorage.getItem('sensesales_integration_logs');
        const existingLogs = existingLogsRaw ? JSON.parse(existingLogsRaw) : [];
        const errorLog = { 
          id: Math.random().toString(), 
          time: new Date().toLocaleTimeString(), 
          action: 'Supabase Update', 
          status: 'error' as const, 
          message: `Falha ao atualizar agendamento no Supabase: ${err.message || 'Erro inesperado'}` 
        };
        localStorage.setItem('sensesales_integration_logs', JSON.stringify([errorLog, ...existingLogs].slice(0, 50)));
      }
    }
  };

  // Speaks with representative specifically about the scheduled time
  const handleSpeakWithSpecialistBooked = (date: string, hour: string, meetLink: string) => {
    let formattedDate = date;
    if (date && date.includes('-')) {
      const parts = date.split('-');
      if (parts.length === 3) {
        formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    
    // Check if hour looks like "Confirmado no Calendly" or similar
    const hourSuffix = hour && (hour.toLowerCase().includes('confirmado') || hour.toLowerCase().includes('calendly'))
      ? ''
      : ` às *${hour}h*`;

    const baseMessage = `Olá! Concluí minha análise estratégica da Catalyize e agendei nossa reunião estratégica de diagnóstico para o dia *${formattedDate}*${hourSuffix}.

Aqui estão os detalhes da reunião:
📅 Data: ${formattedDate}
⏰ Horário: ${hour}${hour.toLowerCase().includes('confirmado') ? '' : 'h (Horário de Brasília)'}
🎥 Sala do Google Meet: ${meetLink}

O Instagram da minha empresa é *${lead.empresa}*.
Gostaria de falar com o estrategista que me atenderá para adiantar alguns pontos!`;

    const encodedMessage = encodeURIComponent(baseMessage);
    const link = `https://wa.me/5521972736030?text=${encodedMessage}`;
    
    window.open(link, '_blank');
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    let correctPassword = 'sensesales@admin';
    const storedConfig = localStorage.getItem('sensesales_integrations_config');
    if (storedConfig) {
      try {
        const config: IntegrationConfig = JSON.parse(storedConfig);
        if (config.adminPassword) {
          correctPassword = config.adminPassword;
        }
      } catch (err) {
        console.error('Error parsing config password', err);
      }
    }

    if (adminPasswordInput === correctPassword) {
      setIsAdminAuthenticated(true);
      sessionStorage.setItem('sensesales_admin_logged_in', 'true');
      setAdminLoginError(null);
    } else {
      setAdminLoginError('Senha incorreta. Por favor verifique e tente novamente.');
    }
  };

  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
    sessionStorage.removeItem('sensesales_admin_logged_in');
    setAdminPasswordInput('');
    window.location.hash = '';
    
    // Safely remove /admin from URL if present without refreshing if supported
    if (window.location.pathname.endsWith('/admin')) {
      window.history.pushState(null, '', window.location.pathname.replace(/\/admin$/, ''));
    }
    setIsAdminRoute(false);
  };

  if (isAdminRoute) {
    if (!isAdminAuthenticated) {
      return (
        <div className="min-h-screen mesh-gradient bg-black flex flex-col items-center justify-center p-4 relative font-sans overflow-hidden text-slate-100">
          {/* Mesh Background & Glowing Orbs */}
          <div className="absolute inset-0 mesh-gradient pointer-events-none"></div>
          <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-sky-500 rounded-full blur-[140px] opacity-[0.06] pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-teal-500 rounded-full blur-[140px] opacity-[0.06] pointer-events-none" />
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-md p-8 md:p-10 glass-panel bg-zinc-950/90 border border-zinc-800/80 rounded-[32px] shadow-2xl relative z-10 space-y-6 text-left"
          >
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-teal-950/60 border border-teal-800/80 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Lock className="w-5 h-5 text-teal-400" />
              </div>
              <h1 className="font-display font-semibold text-2xl text-white tracking-tight">Painel do Integrador</h1>
              <p className="text-xs text-slate-400">
                Insira a senha do administrador cadastrada para controlar webhooks, leads, analytics e tags.
              </p>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2">SENHA DE ACESSO</label>
                <input
                  type="password"
                  required
                  value={adminPasswordInput}
                  onChange={(e) => {
                    setAdminPasswordInput(e.target.value);
                    if (adminLoginError) setAdminLoginError(null);
                  }}
                  placeholder="Selecione ou insira a senha..."
                  className="w-full text-xs font-mono bg-black border border-zinc-800 rounded-2xl p-4 text-white focus:border-sky-500 focus:outline-none transition-all placeholder:text-slate-500"
                />
              </div>

              {adminLoginError && (
                <div className="text-xs text-rose-300 font-sans leading-relaxed bg-rose-950/60 border border-rose-800 p-3.5 rounded-xl">
                  {adminLoginError}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-4 bg-sky-600 hover:bg-sky-500 text-white font-display font-bold text-sm tracking-wide rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Acessar Painel</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  window.location.hash = '';
                  if (window.location.pathname.endsWith('/admin')) {
                    window.history.pushState(null, '', window.location.pathname.replace(/\/admin$/, ''));
                  }
                  setIsAdminRoute(false);
                }}
                className="text-xs font-mono text-slate-400 hover:text-white transition-colors"
              >
                ← VOLTAR PARA O DIAGNÓSTICO
              </button>
            </div>
          </motion.div>
        </div>
      );
    }

    // Authenticated admin view
    return (
      <div className="min-h-screen bg-black text-slate-100 flex flex-col font-sans">
        <header className="border-b border-zinc-800 bg-zinc-950/90 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-teal-950/60 flex items-center justify-center border border-teal-800">
              <Lock className="w-4 h-4 text-teal-400" />
            </div>
            <div className="text-left">
              <span className="text-[10px] font-mono text-teal-400 font-bold tracking-widest uppercase block">PAINEL DO ADMINISTRADOR</span>
              <h1 className="text-xs font-display font-medium text-white tracking-tight">Catalyize Integrador</h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleAdminLogout}
              className="text-xs font-mono bg-zinc-900 hover:bg-zinc-800 px-4 py-2 border border-zinc-800 rounded-xl text-slate-200 hover:text-white transition-all cursor-pointer"
            >
              SAIR DO PAINEL (LOGOUT)
            </button>
          </div>
        </header>

        <div className="flex-1 w-full bg-black">
          <AdminPanel onClose={handleAdminLogout} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen mesh-gradient bg-black text-slate-100 flex flex-col justify-between p-4 sm:p-8 md:p-12 relative font-sans overflow-y-auto overflow-x-hidden">
      
      {/* Mesh Background & Glowing Orbs */}
      <div className="absolute inset-0 mesh-gradient pointer-events-none"></div>
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-sky-500 rounded-full blur-[160px] opacity-[0.06] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-teal-500 rounded-full blur-[160px] opacity-[0.06] pointer-events-none" />

      {/* Header bar */}
      <header className="w-full max-w-4xl mx-auto z-10 pt-2 pb-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold tracking-[0.15em] uppercase text-white font-display">Catalyize</span>
          </div>

          <div className="flex items-center gap-4">
          </div>
        </div>

        {/* Dynamic Top Progress Bar */}
        {currentStep > 0 && !isCompleted && !isProcessing && (
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden transition-all duration-300">
            <div 
              className="h-full bg-gradient-to-r from-sky-500 to-teal-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className={`w-full mx-auto flex-1 flex flex-col items-center justify-center z-10 py-6 my-auto transition-all duration-500 ${
        currentStep === 0 ? 'max-w-4xl px-2 sm:px-0' : 'max-w-2xl px-2 sm:px-0'
      }`}>
        <AnimatePresence mode="wait">
          
          {/* STATE 0: WELCOME SCREEN */}
          {currentStep === 0 && !isProcessing && !isCompleted && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ 
                duration: 0.4,
                ease: [0.16, 1, 0.3, 1]
              }}
              className="w-full text-center space-y-10 py-8 md:py-24 relative z-10"
              id="welcome-screen"
            >
              {/* Headline & Subtitle */}
              <div className="space-y-6 max-w-4xl mx-auto w-full px-2">
                <h1 className="font-display font-bold text-2xl xs:text-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-[1.15] text-white tracking-tight antialiased flex flex-col items-center">
                  <span className="block">Sua operação comercial</span>
                  <span className="bg-gradient-to-r from-sky-400 to-teal-400 bg-clip-text text-transparent block">está preparada para crescer?</span>
                </h1>
                <p className="text-sm md:text-base lg:text-lg text-slate-300 max-w-2xl mx-auto font-sans font-normal leading-relaxed antialiased px-2">
                  Em menos de 2 minutos, responda algumas perguntas e descubra os principais pontos que podem estar impedindo sua empresa de vender mais.
                </p>
              </div>

              {/* Principal CTA Button */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2 px-2">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="w-full sm:w-auto px-10 py-4.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-[15px] tracking-wide rounded-2xl transition-all group flex items-center justify-center gap-2.5 hover:translate-y-[-2px] hover:shadow-lg active:translate-y-[0px] cursor-pointer shadow-md"
                  id="btn-start"
                >
                  <span>Começar diagnóstico</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </button>
              </div>

              {/* Minor metadata */}
              <p className="text-[10px] font-mono text-slate-500 tracking-widest select-none uppercase pt-2">
                Leva menos de 2 minutos • Catalyize
              </p>
            </motion.div>
          )}

          {/* STATE 1: CONVERSATIONAL QUESTIONS */}
          {currentStep > 0 && !isProcessing && !isCompleted && currentQuestion && (
            <motion.div
              key={currentQuestion.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ 
                duration: 0.4,
                ease: [0.16, 1, 0.3, 1] // Custom butter-smooth easeOutExpo
              }}
              className="w-full text-left space-y-6 p-5 sm:p-8 md:p-12 glass-panel bg-zinc-950/90 border border-zinc-800/80 rounded-2xl sm:rounded-[32px] shadow-2xl relative overflow-hidden transition-[border-color,box-shadow] duration-300 hover:border-zinc-700"
              id={`question-step-${currentStep}`}
            >
              
              {/* Question Title with Indicator Arrow */}
              <div className="flex items-start gap-3 sm:gap-4 mb-2">
                <h2 className="font-display font-medium text-lg sm:text-2xl md:text-3xl leading-tight text-white tracking-tight max-w-2xl">
                  {currentQuestion.title}
                </h2>
              </div>

              {/* INPUT TYPE RENDERING */}
              <div className="space-y-4 pt-2">
                
                {/* 1. Standard text, email & phone inputs */}
                {(currentQuestion.type === 'text' || currentQuestion.type === 'email' || currentQuestion.type === 'tel') && (
                  <div className="relative">
                    <input
                      ref={inputRef}
                      type={currentQuestion.type}
                      value={inputValue}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder={currentQuestion.placeholder}
                      className="w-full bg-black border border-zinc-800 hover:border-zinc-700 focus:border-sky-500 focus:ring-2 focus:ring-sky-900/50 rounded-2xl px-5 py-4 text-white text-base md:text-lg transition-all font-sans tracking-wide placeholder:text-slate-500"
                      id={`input-variable-${currentQuestion.variable}`}
                    />
                    
                    {/* Corner checkmark decor if filled and valid */}
                    {inputValue.length > 3 && !validationError && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-teal-950 border border-teal-800 flex items-center justify-center text-teal-400 animate-scaleIn">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Multiple choice options */}
                {currentQuestion.type === 'select' && currentQuestion.options && (
                  <div className="space-y-3" id={`select-options-${currentQuestion.variable}`}>
                    {currentQuestion.options.map((option, idx) => {
                      const isSelected = lead[currentQuestion.variable] === option;
                      const optionLetter = String.fromCharCode(65 + idx); // A, B, C, D, E...
                      return (
                        <button
                          key={idx}
                          onClick={() => handleOptionSelect(option)}
                          className={`w-full option-btn flex items-center justify-between p-4 md:p-5 rounded-2xl text-left cursor-pointer group ${
                            isSelected 
                              ? 'border-sky-500 bg-sky-950/60 option-btn-selected shadow-xs text-sky-300 font-medium' 
                              : 'border-zinc-800/90 bg-black/80 text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900'
                          }`}
                          id={`option-${idx}`}
                        >
                          <div className="flex items-center gap-4">
                            <span className={`w-8 h-8 flex items-center justify-center rounded-lg border text-xs font-mono transition-all duration-300 ${
                              isSelected 
                                ? 'border-sky-500 bg-sky-500 text-white font-bold' 
                                : 'border-zinc-800 text-slate-400 bg-zinc-900 group-hover:border-sky-500 group-hover:text-sky-400'
                            }`}>
                              {optionLetter}
                            </span>
                            <span className={`text-sm md:text-base transition-colors ${isSelected ? 'font-semibold text-sky-300' : 'text-slate-200 group-hover:text-white'}`}>
                              {option}
                            </span>
                          </div>
                          <div className={`transition-all duration-300 ${isSelected ? 'opacity-100 scale-100 text-sky-400' : 'opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 text-sky-400'}`}>
                            <Check className="w-5 h-5 stroke-[2.5px]" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 2.1 Multiple-selection options (Multiselect) */}
                {currentQuestion.type === 'multiselect' && currentQuestion.options && (
                  <div className="space-y-3" id={`multiselect-options-${currentQuestion.variable}`}>
                    {currentQuestion.options.map((option, idx) => {
                      const currentSelected = Array.isArray(lead[currentQuestion.variable])
                        ? (lead[currentQuestion.variable] as string[])
                        : [];
                      const isSelected = currentSelected.includes(option);
                      const optionLetter = String.fromCharCode(65 + idx); // A, B, C...
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleMultiSelectToggle(option)}
                          className={`w-full option-btn flex items-center justify-between p-4 md:p-5 rounded-2xl text-left cursor-pointer transition-all duration-300 group ${
                            isSelected 
                              ? 'border-sky-500 bg-sky-950/60 option-btn-selected text-sky-300 font-medium' 
                              : 'border-zinc-800/90 bg-black/80 text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900'
                          }`}
                          id={`multi-option-${idx}`}
                        >
                          <div className="flex items-center gap-4">
                            <span className={`w-8 h-8 flex items-center justify-center rounded-lg border text-xs font-mono transition-all duration-300 ${
                              isSelected 
                                ? 'border-sky-500 bg-sky-500 text-white font-bold' 
                                : 'border-zinc-800 text-slate-400 bg-zinc-900 group-hover:border-sky-500 group-hover:text-sky-400'
                            }`}>
                              {optionLetter}
                            </span>
                            <span className={`text-sm md:text-base transition-colors ${isSelected ? 'font-semibold text-sky-300' : 'text-slate-200 group-hover:text-white'}`}>
                              {option}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                              isSelected 
                                ? 'border-sky-500 bg-sky-500 text-white' 
                                : 'border-zinc-700 text-transparent group-hover:border-sky-500'
                            }`}>
                              <Check className="w-3.5 h-3.5 stroke-[3px]" />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    <p className="text-[10px] text-slate-400 font-mono text-center pt-2 select-none">
                      💡 Selecione todas as opções que se aplicam e depois clique em "AVANÇAR"
                    </p>
                  </div>
                )}

                {/* 3. Checkbox standard interface */}
                {currentQuestion.type === 'checkbox' && (
                  <label 
                    className={`flex items-start gap-3.5 p-4 rounded-xl border transition-all cursor-pointer ${
                      checkboxValue 
                        ? 'bg-teal-950/50 border-teal-700' 
                        : 'bg-black border-zinc-800 hover:bg-zinc-950'
                    }`}
                    id="checkbox-wrapper"
                  >
                    <input
                      type="checkbox"
                      checked={checkboxValue}
                      onChange={(e) => {
                        setCheckboxValue(e.target.checked);
                        if (validationError) setValidationError(null);
                      }}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded border mt-0.5 flex items-center justify-center transition-colors shrink-0 ${
                      checkboxValue 
                        ? 'border-teal-500 bg-teal-500 text-white' 
                        : 'border-zinc-700 bg-zinc-900'
                    }`}>
                      {checkboxValue && <Check className="w-3.5 h-3.5 stroke-[3px]" />}
                    </div>
                    <div>
                      <p className="text-xs text-slate-300 leading-relaxed select-none">
                        Autorizo o tratamento dos meus dados para contato comercial e análise estratégica da minha empresa.
                      </p>
                    </div>
                  </label>
                )}

              </div>

              {/* Error Warning */}
              <AnimatePresence>
                {validationError && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="flex items-center gap-2 text-rose-300 bg-rose-950/60 border border-rose-800 px-4 py-2.5 rounded-xl text-xs font-medium"
                    id="validation-error-alert"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{validationError}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Interactive buttons */}
              {currentQuestion.type !== 'select' && (
                <div className="flex items-center justify-end pt-5 border-t border-zinc-800/80">
                  <div className="flex items-center gap-4">
                    {/* Hints for desktop and click callbacks */}
                    <span className="hidden md:inline-block text-[10px] font-mono text-slate-400 select-none">
                      (pressione Enter <kbd className="bg-zinc-900 px-1 py-0.5 rounded border border-zinc-800 font-sans text-slate-300">↵</kbd>)
                    </span>
                    
                    <button
                      onClick={handleNext}
                      className="px-6 py-3 bg-sky-600 hover:bg-sky-500 text-white font-display font-bold text-xs tracking-wider rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                      id="btn-next"
                    >
                      <span>{currentStep === totalQuestionsCount ? 'CONCLUIR' : 'AVANÇAR'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

            </motion.div>
          )}

          {/* STATE 1.5: CONTACT STEP (STEP 5) */}
          {currentStep === 5 && !isProcessing && !isCompleted && (
            <motion.div
              key="contact-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ 
                duration: 0.4,
                ease: [0.16, 1, 0.3, 1]
              }}
              className="w-full text-left space-y-6 p-5 sm:p-8 md:p-12 glass-panel bg-zinc-950/90 border border-zinc-800 rounded-2xl sm:rounded-[32px] shadow-2xl relative overflow-hidden transition-[border-color,box-shadow] duration-300 hover:border-zinc-700"
              id="question-step-contact"
            >
              <div className="space-y-1.5">
                <h2 className="font-display font-medium text-xl sm:text-2xl md:text-3xl leading-tight text-white tracking-tight">
                  Quase lá, onde a gente te encontra?
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 font-sans">
                  Preencha seus dados para continuarmos
                </p>
              </div>

              <div className="space-y-4 pt-2">
                {/* Nome completo */}
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                    Nome completo
                  </label>
                  <input
                    type="text"
                    value={lead.nome}
                    onChange={(e) => {
                      setLead(prev => ({ ...prev, nome: e.target.value }));
                      if (validationError) setValidationError(null);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Digite seu nome completo..."
                    className="w-full bg-black border border-zinc-800 hover:border-zinc-700 focus:border-sky-500 focus:ring-2 focus:ring-sky-900/50 rounded-2xl px-5 py-3.5 text-white text-sm md:text-base transition-all font-sans tracking-wide placeholder:text-slate-500"
                  />
                </div>

                {/* E-mail */}
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={lead.email}
                    onChange={(e) => {
                      setLead(prev => ({ ...prev, email: e.target.value }));
                      if (validationError) setValidationError(null);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="seu.email@empresa.com.br"
                    className="w-full bg-black border border-zinc-800 hover:border-zinc-700 focus:border-sky-500 focus:ring-2 focus:ring-sky-900/50 rounded-2xl px-5 py-3.5 text-white text-sm md:text-base transition-all font-sans tracking-wide placeholder:text-slate-500"
                  />
                </div>

                {/* Telefone */}
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                    Telefone
                  </label>
                  <input
                    type="tel"
                    value={lead.whatsapp}
                    onChange={(e) => {
                      const masked = maskPhone(e.target.value);
                      setLead(prev => ({ ...prev, whatsapp: masked, telefone: masked }));
                      if (validationError) setValidationError(null);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="(11) 99999-9999"
                    className="w-full bg-black border border-zinc-800 hover:border-zinc-700 focus:border-sky-500 focus:ring-2 focus:ring-sky-900/50 rounded-2xl px-5 py-3.5 text-white text-sm md:text-base transition-all font-sans tracking-wide placeholder:text-slate-500"
                  />
                </div>

                {/* LGPD Checkbox */}
                <label 
                  className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all cursor-pointer ${
                    lead.lgpd 
                      ? 'bg-teal-950/50 border-teal-700' 
                      : 'bg-black border-zinc-800 hover:bg-zinc-950'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={lead.lgpd}
                    onChange={(e) => {
                      setLead(prev => ({ ...prev, lgpd: e.target.checked }));
                      if (validationError) setValidationError(null);
                    }}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded border mt-0.5 flex items-center justify-center transition-colors shrink-0 ${
                    lead.lgpd 
                      ? 'border-teal-500 bg-teal-500 text-white' 
                      : 'border-zinc-700 bg-zinc-900'
                  }`}>
                    {lead.lgpd && <Check className="w-3.5 h-3.5 stroke-[3px]" />}
                  </div>
                  <div>
                    <p className="text-xs text-slate-300 leading-relaxed select-none">
                      Autorizo o tratamento dos meus dados para contato comercial e análise estratégica da minha empresa.
                    </p>
                  </div>
                </label>
              </div>

              {/* Error Warning */}
              <AnimatePresence>
                {validationError && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="flex items-center gap-2 text-rose-300 bg-rose-950/60 border border-rose-800 px-4 py-2.5 rounded-xl text-xs font-medium"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{validationError}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Interactive buttons */}
              <div className="flex items-center justify-between pt-5 border-t border-zinc-800">
                <button
                  onClick={() => {
                    setValidationError(null);
                    setCurrentStep(4);
                  }}
                  className="px-4 py-2.5 text-slate-400 hover:text-white font-mono text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>VOLTAR</span>
                </button>

                <button
                  onClick={handleContactSubmit}
                  className="px-6 py-3 bg-sky-600 hover:bg-sky-500 text-white font-display font-bold text-xs tracking-wider rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  <span>CONCLUIR DIAGNÓSTICO</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

            </motion.div>
          )}

          {/* STATE 2: LOADING/PROCESSING SEQUENCE (2 SECONDS) */}
          {isProcessing && (
            <motion.div
              key="loader"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ 
                duration: 0.4,
                ease: [0.16, 1, 0.3, 1]
              }}
              className="w-full flex justify-center py-6"
            >
              <LoaderStep onComplete={handleLoaderComplete} />
            </motion.div>
          )}

          {/* STATE 3: REDIRECTION TO EXTERNAL THANK-YOU PAGE */}
          {isCompleted && !isProcessing && (
            <div className="w-full max-w-xl mx-auto space-y-6">
              <motion.div
                key="completed-screen"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ 
                  duration: 0.4,
                  ease: [0.16, 1, 0.3, 1]
                }}
                className="w-full space-y-6 p-6 sm:p-10 glass-panel bg-zinc-950/90 rounded-2xl sm:rounded-[32px] shadow-2xl relative overflow-hidden text-center flex flex-col items-center border border-teal-800/80"
                id="debrief-screen"
              >
                {/* Animated Badge */}
                <div className="w-16 h-16 rounded-full bg-teal-950/80 border border-teal-800 flex items-center justify-center text-teal-400 animate-pulse">
                  <Sparkles className="w-8 h-8" />
                </div>

                {/* Title & Subtext */}
                <div className="text-center space-y-3">
                  <h1 className="font-display font-bold text-2xl md:text-3xl text-white tracking-tight">
                    Diagnóstico Concluído!
                  </h1>
                  <p className="text-xs md:text-sm text-slate-400 leading-relaxed max-w-md mx-auto">
                    Redirecionando você para a página de obrigado...
                  </p>
                </div>

                {/* Animated Loading Bar */}
                <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden border border-zinc-800 max-w-xs">
                  <div className="bg-gradient-to-r from-sky-500 to-teal-500 h-full animate-pulse w-full" />
                </div>

                {/* Explicit Fallback Button */}
                <div className="pt-2 w-full">
                  <a
                    href={REDIRECT_THANK_YOU_URL}
                    className="inline-flex items-center justify-center gap-2 w-full px-6 py-3.5 bg-sky-600 hover:bg-sky-500 text-white font-display font-bold text-xs tracking-wider rounded-xl transition-all cursor-pointer shadow-md"
                  >
                    <span>CLIQUE AQUI CASO NÃO SEJA REDIRECIONADO</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </div>

              </motion.div>
            </div>
          )}

        </AnimatePresence>
      </main>

      {/* Footer bar */}
      <footer className="w-full max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between text-[10px] font-mono text-slate-500 z-10 py-3 gap-2 border-t border-slate-800">
        <div className="flex items-center gap-4">
          <span>CATALYIZE © 2026</span>
          <span className="hidden md:inline">•</span>
          <span className="hover:text-slate-300 transition-colors">POLÍTICA DE PRIVACIDADE</span>
          <span className="hidden md:inline">•</span>
          <span className="hover:text-slate-300 transition-colors">DIRETRIZES DE LGPD</span>
        </div>

        {/* Dynamic progress tracker indicator */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          {currentStep > 0 && !isCompleted && !isProcessing && (
            <div className="flex items-center gap-2 w-full md:w-56">
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-sky-500 to-teal-500 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </footer>

    </div>
  );
}
