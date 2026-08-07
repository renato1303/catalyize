import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Calendar as CalendarIcon, Loader2, AlertCircle, Info, HelpCircle, CheckCircle2, PhoneCall
} from 'lucide-react';
import { LeadData, IntegrationConfig } from '../types';

interface BookingCalendarProps {
  lead: LeadData;
  onBookingComplete: (date: string, hour: string, meetLink: string) => void;
  onBackToSummary: () => void;
}

export default function BookingCalendar({ lead, onBookingComplete, onBackToSummary }: BookingCalendarProps) {
  const [isLoadingIframe, setIsLoadingIframe] = useState(true);
  const [calendlyUrl, setCalendlyUrl] = useState('https://calendly.com/contatosensesales/30min');
  const [hasError, setHasError] = useState(false);

  // Load custom configured Calendly link if set in configurations
  useEffect(() => {
    const storedConfig = localStorage.getItem('sensesales_integrations_config');
    if (storedConfig) {
      try {
        const config: IntegrationConfig = JSON.parse(storedConfig);
        if (config.calendlyUrl) {
          setCalendlyUrl(config.calendlyUrl);
        }
      } catch (err) {
        console.error('Error reading integrations config for Calendly:', err);
      }
    }
  }, []);

  // Listen for Calendly event successfully scheduled postMessage
  useEffect(() => {
    function handleCalendlyMessage(e: MessageEvent) {
      if (e.data && e.data.event && e.data.event === 'calendly.event_scheduled') {
        // Event scheduled! Capture and progress to success stage
        const todayStr = new Date().toLocaleDateString('pt-BR');
        onBookingComplete(
          todayStr,
          'Confirmado no Calendly',
          'Link enviado pelo Calendly (E-mail/WhatsApp)'
        );
      }
    }

    window.addEventListener('message', handleCalendlyMessage);
    return () => {
      window.removeEventListener('message', handleCalendlyMessage);
    };
  }, [onBookingComplete]);

  // Construct optimized prefilled embedding URL for Calendly
  const getPrefilledUrl = () => {
    try {
      const urlObj = new URL(calendlyUrl);
      
      // Prefill Name
      if (lead.nome) {
        urlObj.searchParams.append('name', lead.nome);
      }
      // Prefill Email
      if (lead.email) {
        urlObj.searchParams.append('email', lead.email);
      }
      
      // Prefill WhatsApp / Phone numbers inside custom query parameters
      const phoneVal = lead.whatsapp || lead.telefone || '';
      if (phoneVal) {
        urlObj.searchParams.append('phone', phoneVal);
        urlObj.searchParams.append('a1', phoneVal); // Common custom field identifier
      }

      // Hide extra widgets and styling elements to embed as a clean native card
      urlObj.searchParams.append('hide_event_type_details', '1');
      urlObj.searchParams.append('hide_gdpr_banner', '1');

      return urlObj.toString();
    } catch (e) {
      // Fallback
      return `${calendlyUrl}?name=${encodeURIComponent(lead.nome || '')}&email=${encodeURIComponent(lead.email || '')}`;
    }
  };

  const iframeSrc = getPrefilledUrl();

  return (
    <div className="w-full space-y-6 p-4 sm:p-6 md:p-8 glass-panel rounded-2xl sm:rounded-[32px] shadow-2xl relative overflow-hidden text-left" id="calendar-booking-card">
      {/* Background ambient accents */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-brand-cyan/5 rounded-full blur-[80px]" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-brand-green/5 rounded-full blur-[80px]" />

      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h2 className="font-display font-medium text-xl sm:text-2xl text-slate-900 tracking-tight">
            Reserve o Horário do seu Diagnóstico
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Escolha uma data e horário em nossa agenda e confirme em poucos segundos.
          </p>
        </div>

        {/* Dynamic Indicator */}
        <div className="shrink-0 flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs">
          <div className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />
          <span className="text-slate-800 font-medium text-[11px] font-sans">Agendamento Exclusivo e Rápido</span>
        </div>
      </div>

      {/* Embedded Iframe Container */}
      <div className="relative w-full h-[500px] xs:h-[560px] sm:h-[620px] bg-white rounded-2xl overflow-hidden shadow-inner border border-slate-200">
        {isLoadingIframe && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white space-y-4 z-10">
            <Loader2 className="w-8 h-8 text-sky-600 animate-spin" />
            <div className="text-center space-y-1">
              <p className="text-xs font-mono text-slate-900 font-semibold tracking-wider">ESTRUTURANDO DIAGNÓSTICO...</p>
              <p className="text-[10px] text-slate-500">Sincronizando agenda do Calendly em tempo real.</p>
            </div>
          </div>
        )}

        {!hasError ? (
          <iframe 
            src={iframeSrc}
            width="100%"
            height="100%"
            frameBorder="0"
            title="Calendly Scheduling"
            onLoad={() => setIsLoadingIframe(false)}
            onError={() => {
              setHasError(true);
              setIsLoadingIframe(false);
            }}
            className="w-full h-full rounded-2xl"
            id="calendly-frame"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-rose-500" />
            <p className="text-sm font-sans font-medium text-slate-900">Não foi possível exibir a agenda do Calendly.</p>
            <p className="text-xs text-slate-500 max-w-md leading-relaxed">
              Verifique se sua conexão de rede está ativa ou tente abrir o link do agendamento diretamente no seu navegador.
            </p>
            <a 
              href={calendlyUrl} 
              target="_blank" 
              rel="noreferrer" 
              className="px-6 py-3 bg-sky-600 text-white font-semibold text-xs rounded-xl hover:bg-sky-700 transition-colors"
            >
              Abrir Agenda Externa
            </a>
          </div>
        )}
      </div>

      {/* Dynamic WhatsApp CTA block below the Calendly iframe */}
      <div className="pt-6 border-t border-slate-100 flex flex-col items-center text-center space-y-4" id="calendar-whatsapp-cta">
        <div className="space-y-1.5">
          <span className="text-teal-700 font-display font-bold text-sm sm:text-base tracking-wider block">
            ÚLTIMO PASSO 👇🏽
          </span>
          <p className="text-xs sm:text-sm text-slate-700 font-medium leading-relaxed max-w-lg mx-auto">
            Chame nossos especialistas no WhatsApp para confirmar a reunião de diagnóstico gratuito da sua operação
          </p>
        </div>
        
        <button
          onClick={() => {
            const todayStr = new Date().toLocaleDateString('pt-BR');
            onBookingComplete(
              todayStr,
              'Confirmado no Calendly',
              'Link enviado pelo Calendly (E-mail/WhatsApp)'
            );
            
            const baseMessage = `Olá! Concluí minha análise estratégica da Catalyize e agendei nossa reunião estratégica de diagnóstico para o dia *${todayStr}* (Confirmado no Calendly).

O Instagram da minha empresa é *${lead.empresa || ''}*.
Gostaria de falar com o estrategista que me atenderá para adiantar alguns pontos!`;
            
            const encodedMessage = encodeURIComponent(baseMessage);
            const link = `https://wa.me/5521972736030?text=${encodedMessage}`;
            window.open(link, '_blank');
          }}
          className="w-full py-4 bg-[#25D366] hover:bg-[#20ba5a] text-white font-display font-bold text-sm tracking-wide rounded-2xl transition-all group flex items-center justify-center gap-2.5 scale-100 hover:scale-[1.01] shadow-[0_0_30px_rgba(37,211,102,0.25)] cursor-pointer"
          id="btn-speak-specialist-booked-calendar"
        >
          <PhoneCall className="w-4 h-4 text-white animate-bounce" />
          <span>FALAR COM ESPECIALISTAS NO WHATSAPP</span>
        </button>
      </div>

    </div>
  );
}
