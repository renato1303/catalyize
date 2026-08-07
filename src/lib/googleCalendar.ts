import { LeadData } from '../types';

export interface TimeSlot {
  time: string; // "09:30"
  available: boolean;
}

// Fixed standard available slots
export const STANDARD_HOURS = [
  '09:30', '10:00', '10:30', '11:00', '11:30',
  '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30'
];

/**
 * Checks busy intervals for a given day in the America/Sao_Paulo timezone.
 * Returns a list of available slots.
 */
export async function getAvailableSlots(
  accessToken: string,
  dateStr: string // "YYYY-MM-DD"
): Promise<TimeSlot[]> {
  const timeMin = `${dateStr}T00:00:00-03:00`;
  const timeMax = `${dateStr}T23:59:59-03:00`;

  const url = 'https://www.googleapis.com/calendar/v3/freeBusy';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone: 'America/Sao_Paulo',
      items: [{ id: 'primary' }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('FreeBusy API error:', errText);
    throw new Error(`Falha ao obter agenda do Google Calendar: ${errText}`);
  }

  const data = await response.json();
  const busyPeriods: { start: string; end: string }[] =
    data.calendars?.primary?.busy || [];

  // Map busy periods to timestamps for accurate comparison
  const busyRanges = busyPeriods.map((p) => ({
    start: new Date(p.start).getTime(),
    end: new Date(p.end).getTime(),
  }));

  // Analyze each standard hour slot
  return STANDARD_HOURS.map((hour) => {
    // Construct Date objects for this slot in America/Sao_Paulo (UTC -3)
    const slotStartStr = `${dateStr}T${hour}:00-03:00`;
    const slotStart = new Date(slotStartStr).getTime();
    
    // Each meeting slot is 30 mins
    const slotEnd = slotStart + 30 * 60 * 1000;

    // Check overlap: SlotStart < BusyEnd && SlotEnd > BusyStart
    const isOverlapping = busyRanges.some((busy) => {
      return slotStart < busy.end && slotEnd > busy.start;
    });

    return {
      time: hour,
      available: !isOverlapping,
    };
  });
}

/**
 * Creates a Calendar event with automatic Google Meet integration.
 * Triggers invitations to both Lead and Organizer.
 */
export async function createMeetingEvent(
  accessToken: string,
  organizerEmail: string,
  lead: LeadData,
  dateStr: string, // "YYYY-MM-DD"
  hourStr: string // "14:30"
): Promise<{
  eventId: string;
  googleMeetLink: string;
}> {
  // ISO Dates in America/Sao_Paulo Timezone (UTC-3)
  const startIso = `${dateStr}T${hourStr}:00-03:00`;
  const slotStart = new Date(startIso);
  const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
  const endIso = slotEnd.toISOString().replace('.000Z', '-03:00'); // construct correctly or pass ISO conversion

  // Build descriptive detail card content for the calendar event description
  const oportunidadesStr = Array.isArray(lead.origemLeads) ? lead.origemLeads.join(', ') : (lead.origemLeads || 'Não informado');
  const descriptionText = `📄 DETALHES COMPLETOS DO DIAGNÓSTICO COMERCIAL (CATALYIZE)
------------------------------------------------------------------
👤 Nome: ${lead.nome}
🏢 Nome da Empresa: ${lead.empresa}
💼 Segmento: ${lead.segmento || 'Não informado'}
📈 Faturamento Mensal: ${lead.faturamento}

⚙️ OPERAÇÃO COMERCIAL:
- Processo de Vendas: ${lead.operacaoComercial || 'Não informado'}
- Geração de Oportunidades: ${oportunidadesStr}
- Utiliza CRM: ${lead.crm || 'Não informado'}
- Número de Vendedores: ${lead.equipeComercial || 'Não informado'}

📊 MARKETING & PLANEJAMENTO:
- Investimento em Marketing: ${lead.investimentoMarketing || 'Não informado'}
- Principal Desafio: ${lead.desafioPrincipal || 'Não informado'}
- Momento Atual: ${lead.momentoEmpresa || 'Não informado'}
- Prazo para iniciar: ${lead.prazoInicio || 'Não informado'}

📞 WhatsApp/Telefone: ${lead.whatsapp || lead.telefone || 'Não informado'}
✉️ E-mail: ${lead.email}

⭐ Lead Score Calculado: ${lead.leadScore ?? 0}%
------------------------------------------------------------------
🔗 Reunião Estratégica agendada via Catalyize Interactive Diagnostic.`;

  const payload = {
    summary: `Reunião Estratégica: Catalyize x ${lead.empresa} (${lead.nome})`,
    description: descriptionText,
    start: {
      dateTime: startIso,
      timeZone: 'America/Sao_Paulo',
    },
    end: {
      dateTime: slotEnd.toISOString().split('.')[0] + '-03:00', // ensure valid format: YYYY-MM-DDTHH:MM:SS-03:00
      timeZone: 'America/Sao_Paulo',
    },
    attendees: [
      { email: lead.email, responseStatus: 'needsAction' },
      { email: organizerEmail, responseStatus: 'accepted' },
    ],
    conferenceData: {
      createRequest: {
        requestId: `sense-${lead.id}-${Date.now()}`,
        conferenceSolutionKey: {
          type: 'hangoutsMeet',
        },
      },
    },
  };

  // Google Calendar API Event Insert endpoint with conferenceDataVersion=1
  const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Create Event error:', errText);
    throw new Error(`Falha ao criar evento no calendário: ${errText}`);
  }

  const eventData = await response.json();
  const eventId = eventData.id;

  // Extract Meet Link
  let googleMeetLink = '';
  if (eventData.conferenceData?.entryPoints) {
    const videoEntryPoint = eventData.conferenceData.entryPoints.find(
      (ep: any) => ep.entryPointType === 'video'
    );
    if (videoEntryPoint) {
      googleMeetLink = videoEntryPoint.uri;
    }
  }

  // Fallback if meet link is empty
  if (!googleMeetLink && eventData.htmlLink) {
    googleMeetLink = eventData.htmlLink;
  }

  return {
    eventId,
    googleMeetLink,
  };
}
