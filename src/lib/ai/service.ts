// src/lib/ai/service.ts
// Central AI business logic service for A3CEND Outreach

import { generateStructuredJson } from './openai'
import type {
  ContactClassificationInput,
  ContactClassificationOutput,
  DecisionContext,
  DecisionOutput,
  EmailGenerationContext,
  GeneratedEmailOutput,
  ReplyAnalysisInput,
  ReplyAnalysisOutput,
} from './types'

// A real, publicly-fetchable URL — not a base64 data: URI. Gmail (and many
// other mail clients) strip inline data: URI images from received HTML
// email, so the signature logo has to be hosted somewhere a recipient's
// mail client can actually fetch it from without any auth. Pinned to a
// commit SHA so it's immutable regardless of what main looks like later.
const A3CEND_LOGO_URL =
  'https://raw.githubusercontent.com/nikshitha-v-a3cend/Ascend_Outreach/4164c2d/public/a3cend-logo.png'

const A3CEND_OFFERING_OVERVIEW = `
A3CEND (headquartered at T-Hub, Hyderabad) helps enterprise companies (like IT services firms, GCCs, and tech enterprises) prepare their teams for real client and customer conversations.

WHAT WE ACTUALLY DO (PLAIN ENGLISH):
- Instead of putting team members on real client calls unprepared, or having senior managers spend hours doing manual mock roleplays:
- We provide an AI that acts like a real client or buyer.
- Team members (delivery leads, technical consultants, sales reps, project managers) can do mock client calls with the AI, practice handling difficult questions or pushback, and get instant feedback before speaking with real clients.

HOW TO TALK ABOUT IT:
- NEVER use confusing tech jargon like "simulation platform", "AI sandbox", or "behavioral benchmarks". Real business people do not know what that means.
- Say it simply: "mock client calls with an AI that acts like the client", "practicing tough client conversations before going live", or "helping teams get ready for client-facing meetings".
- We are reaching out to leaders at [Company] regarding their company's client-facing teams, while naturally asking if their group or the capability/training team at [Company] handles this.
`

export async function classifyContact(
  input: ContactClassificationInput
): Promise<ContactClassificationOutput> {
  const systemPrompt = `You are an expert enterprise persona classification agent for A3CEND.
${A3CEND_OFFERING_OVERVIEW}

Carefully analyze the contact details:
- Check if the title or department is Technical/Engineering (e.g. "Technology", "Software", "CTO", "Engineer", "Architect", "Developer", "IT").
- Check if the title is Commercial/Sales (e.g. "Sales", "CRO", "Revenue", "Account Executive", "Business Development").
- Check if the title is Executive/Founding (e.g. "CEO", "Founder", "President", "Managing Director").
- Check if the title is Operations/HR/Enablement.

Assign the exact corresponding persona, seniority, department, industry, and select ONLY the use cases and pain points that match their actual department. Do NOT assign sales use cases to technical roles!

Required JSON Output Schema:
{
  "department": "Engineering / Technology | Sales / Revenue | Executive / Leadership | Operations | Marketing | HR / Enablement",
  "industry": "e.g. SaaS, FinTech, Enterprise Software, Consulting, etc.",
  "persona": "e.g. Tech Leader, VP of Engineering, Sales Leader, CRO, CEO, Operations Director",
  "seniority": "C-Level | VP | Director | Manager | Individual Contributor | Founder | Unknown",
  "role_category": "Technical | Revenue Leadership | Executive | Operations",
  "company_category": "Enterprise | Mid-Market | SMB | Startup | Unknown",
  "relevant_use_cases": ["Array of 1 to 3 role-specific A3CEND use cases matching their domain"],
  "pain_points": ["Array of 1 to 3 specific domain challenges they face"],
  "suggested_angle": "1-sentence tailored angle (e.g. architecture/APIs for tech, deal conversion for sales)",
  "summary": "1-2 sentence executive summary",
  "confidence": 0.95
}`

  const userPrompt = `Classify this contact accurately:
First Name: ${input.first_name}
Last Name: ${input.last_name || 'N/A'}
Email: ${input.email}
Company: ${input.company || 'N/A'}
Department: ${input.department || 'N/A'}
Designation: ${input.designation || 'N/A'}`

  return generateStructuredJson<ContactClassificationOutput>({
    systemPrompt,
    userPrompt,
    temperature: 0.1,
  })
}

export async function decideNextAction(
  context: DecisionContext
): Promise<DecisionOutput> {
  const systemPrompt = `You are the AI Decision Engine for A3CEND Outreach sequences.
${A3CEND_OFFERING_OVERVIEW}

Examine the recipient's profile, full email history, engagement metrics, replies, and decide the NEXT BEST ACTION dynamically.
Make sure the strategy and angle match their true functional department (Technical vs Sales vs Executive vs Operations).

Possible actions include:
- SEND_FIRST_EMAIL: Initial outreach email.
- SEND_FOLLOWUP: Continuation follow-up if they opened cold outreach but haven't replied.
- CHANGE_SUBJECT: Fresh hook / angle if they did not open previous email.
- CHANGE_MESSAGING_ANGLE: Pivot value proposition if previous angle had no response.
- SEND_RELEVANT_CONTENT: Share a technical architecture brief, case study, or demo video.
- ASK_A_QUESTION: Short, low-friction inquiry to prompt reply.
- REENGAGE_THREAD: Contextual follow-up to re-engage a prospect who previously replied and we responded, but went quiet after opening our response.
- WAIT: If not enough time has elapsed or waiting for an out-of-office return.
- STOP: If contact explicitly requested removal, unsubscribed, or expressed negative sentiment (not interested).
- HAND_TO_HUMAN: If contact requested a custom meeting, contract/pricing negotiation, or human intervention.

CRITICAL INVARIANTS & CONVERSATIONAL STRATEGY:
- If contact sentiment is negative (not interested, remove me, unsubscribe) -> MUST return STOP.
- If contact replied with positive or neutral intent -> return HAND_TO_HUMAN or REENGAGE_THREAD.
- If bounced = true -> MUST return STOP.
- If already sent 5 emails with zero response -> return STOP.
- STEP 1 (Initial Outreach): Action should be SEND_FIRST_EMAIL.
- STEP 2 (First Follow-up):
  • If contact opened previous email -> SEND_FOLLOWUP (short conversational bump expanding on their role's pain point).
  • If contact did not open previous email -> CHANGE_SUBJECT (fresh hook / angle to spark curiosity).
- STEP 3 (Second Follow-up):
  • Pivot the angle! Use CHANGE_MESSAGING_ANGLE or SEND_RELEVANT_CONTENT or ASK_A_QUESTION. Focus on a completely different benefit (e.g. saving senior leaders from shadowing client calls, or explaining architecture to business clients).
- STEP 4 (Third Follow-up):
  • Low-friction check-in: ASK_A_QUESTION. Inquire casually if client readiness is on their radar or if a specific colleague handles team capability enablement.
- STEP 5 (Final Sequence Step):
  • Polite breakup / graceful close leaving the door open, or STOP if multiple angles got no response.
- RE-ENGAGEMENT AFTER MANUAL REPLY:
  • If contact status is 'manual_reply_sent' OR if our team previously replied manually and the prospect went quiet -> MUST return REENGAGE_THREAD to send a brief, courteous conversational check-in in the thread.
- Always provide clear reasoning and strategic domain angle.

Required JSON Output Schema:
{
  "action": "SEND_FIRST_EMAIL | SEND_FOLLOWUP | CHANGE_SUBJECT | CHANGE_MESSAGING_ANGLE | SEND_RELEVANT_CONTENT | ASK_A_QUESTION | REENGAGE_THREAD | WAIT | STOP | HAND_TO_HUMAN",
  "reason": "Detailed explanation of why this action was chosen based on their role and data",
  "strategy": "The strategic objective of this action tailored to their domain",
  "tone": "e.g. Technical & Direct, Consultative, Executive Peer-to-Peer",
  "suggested_angle": "The specific domain angle to emphasize",
  "wait_minutes": 0,
  "confidence": 0.95
}`

  const userPrompt = `Context for decision:
CONTACT:
Name: ${context.contact.first_name} ${context.contact.last_name || ''}
Email: ${context.contact.email}
Company: ${context.contact.company || 'N/A'}
Designation: ${context.contact.designation || 'N/A'}
Department: ${context.contact.department || 'N/A'}
AI Persona: ${context.contact.persona || 'N/A'}
Role Category: ${context.contact.role_category || 'N/A'}
Relevant Use Cases: ${JSON.stringify(context.contact.relevant_use_cases || [])}

CAMPAIGN:
Name: ${context.campaign.name}
Objective: ${context.campaign.objective || 'Enterprise Outreach'}
Messaging Guidelines: ${context.campaign.messaging_guidelines || 'Tailor strictly to role'}

CAMPAIGN CONTACT STATUS:
Current Step: ${context.campaign_contact.current_step}
Status: ${context.campaign_contact.status}
Opened: ${context.campaign_contact.opened}
Replied: ${context.campaign_contact.replied}
Bounced: ${context.campaign_contact.bounced}

EMAIL HISTORY (${context.email_history.length} messages):
${context.email_history
      .map(
        (e, idx) => `[Email #${idx + 1} - Step ${e.step}]
Subject: ${e.subject || 'N/A'}
Body Snippet: ${(e.body_text || '').slice(0, 150)}
Sent At: ${e.sent_at || 'N/A'}`
      )
      .join('\n\n')}

ENGAGEMENT EVENTS:
${context.events.map((ev) => `- ${ev.event_type} at ${ev.event_timestamp || 'N/A'}`).join('\n') || 'None recorded'}

REPLIES RECEIVED:
${context.replies
      .map((r) => `- From ${r.from_email}: "${r.subject}" | Body: ${(r.body_text || '').slice(0, 150)}`)
      .join('\n') || 'None'}

PREVIOUS AI DECISIONS:
${context.previous_decisions.map((d) => `- ${d.action}: ${d.reason} (${d.created_at})`).join('\n') || 'None'}
`

  return generateStructuredJson<DecisionOutput>({
    systemPrompt,
    userPrompt,
    temperature: 0.2,
  })
}

export function resolveSenderName(fromName?: string, fromEmail?: string): string {
  if (fromName && fromName.trim() && fromName.trim().toLowerCase() !== 'a3cend') {
    return fromName.trim()
  }
  if (fromEmail) {
    const handle = fromEmail.split('@')[0] || ''
    const parts = handle.split(/[._-]/).filter(Boolean)
    if (parts.length > 0) {
      return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
    }
  }
  return fromName || 'The A3CEND Team'
}

export function buildA3CENDSignature(
  senderName: string,
  senderEmail: string,
  senderTitle?: string
): string {
  const name = resolveSenderName(senderName, senderEmail)
  const email = senderEmail || 'nikshitha.v@a3cend.com'
  const title = senderTitle || 'Enterprise Solutions & Capability Lead'

  return `<table cellpadding="0" cellspacing="0" border="0" style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <tr>
    <td valign="top" style="padding-right: 14px; width: 130px; vertical-align: top;">
      <div style="width: 130px; height: 175px; background: #028097; overflow: hidden; display: block;">
        <img src="${A3CEND_LOGO_URL}" alt="A3CEND" width="130" height="175" style="display: block; width: 130px; height: 175px; object-fit: cover;" />
      </div>
    </td>
    <td valign="top" style="border-left: 2px solid #fc6791; padding-left: 14px; vertical-align: top;">
      <div style="font-size: 18px; font-weight: 800; color: #000000; margin-bottom: 2px; line-height: 1.2;">${name}</div>
      <div style="font-size: 13.5px; font-weight: 700; color: #028097; margin-bottom: 3px; line-height: 1.3;">${title}</div>
      <div style="font-size: 12px; color: #64748b; margin-bottom: 8px; line-height: 1.3;">Ascend Business Solutions Pvt. Ltd.</div>
      <div style="font-size: 12px; color: #334155; line-height: 1.45; margin-bottom: 8px;">
        <strong style="color: #000000;">a:</strong> <span style="text-decoration: underline; font-weight: 700; color: #000000;">A3CEND · Head Office</span><br>
        T-Hub, Hyderabad Knowledge City,<br>
        Telangana 500081, India.
      </div>
      <div style="font-size: 12px; color: #334155; margin-bottom: 8px; line-height: 1.4;">
        <strong style="color: #000000;">e:</strong> <a href="mailto:${email}" style="color: #028097; text-decoration: underline;">${email}</a> &nbsp;|&nbsp; <strong style="color: #000000;">w:</strong> <a href="https://a3cend.com/" style="color: #028097; text-decoration: underline;">https://a3cend.com/</a>
      </div>
      <div>
        <a href="https://www.linkedin.com/company/a3cend" style="display: inline-block; text-decoration: none;">
          <img src="https://cdn-icons-png.flaticon.com/512/174/174857.png" alt="LinkedIn" width="18" height="18" style="display: block; border-radius: 2px;" />
        </a>
      </div>
    </td>
  </tr>
</table>`
}

export async function generatePersonalizedEmail(
  context: EmailGenerationContext & {
    custom_instructions?: string | null
    messaging_guidelines?: string | null
    target_tone?: string | null
  }
): Promise<GeneratedEmailOutput> {
  const resolvedSender = resolveSenderName(context.campaign.from_name, context.campaign.from_email)
  const resolvedEmail = context.campaign.from_email || 'nikshitha.v@a3cend.com'

  const systemPrompt = `You are an autonomous, intelligent B2B outreach engine for A3CEND (headquartered at T-Hub, Hyderabad).
A3CEND helps companies prepare their client-facing and commercial teams by letting them do mock client practice with an AI that acts like the customer.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DYNAMIC REASONING ENGINE (ROLE + COMPANY AWARE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Nothing is static. You must dynamically examine who this person is and what their company does:

1. EXPLORE THE ORGANIZATION:
   - Use your knowledge about [Company]: What does this company actually do? (e.g. Infosys is an IT services giant delivering enterprise tech projects; a SaaS firm sells cloud software; a GCC runs offshore engineering).
   - Naturally ground your message in their company's actual operating reality.

2. THE PITCH IS ABOUT THE COMPANY, THEIR ROLE IS JUST CONTEXT:
   The PRIMARY subject of the email is always A3CEND's company-wide offering — helping [Company]'s client-facing teams broadly (sales, delivery, technical, support) get ready for real client conversations through mock practice with an AI that acts like the customer. Do NOT open the email with "their team's problem" as the subject (e.g. do NOT lead with "Preparing your sales team for..." or "Getting your engineering team comfortable with..." as the first sentence) — that makes their department the subject of the email, which is backwards. The company-wide capability is the subject; their role is only used AFTERWARD, briefly, as a personalizing touch — a reason they specifically would notice or care about this, or a single concrete detail relevant to their function. Their role should color a clause or half-sentence, never anchor the opening or dominate the message.
   - IF APIFY WEB INTELLIGENCE IS AVAILABLE (Company About / Person LinkedIn About):
     Naturally connect your opening line or context to 1 specific detail from their scraped LinkedIn background or company's real mission/services. Show authentic awareness of what they and their company do!

   • IF THEY ARE IN SALES (Sales Lead, VP Sales, Account Executive, BD):
     State the company-wide capability first. Weave in their role only as a brief secondary touch — e.g. "...which probably sounds familiar from the buyer objections and pricing pushback your team deals with."

   • IF THEY ARE TECHNICAL / ENGINEERING (Tech Lead, Architect, VP Tech, CTO):
     State the company-wide capability first. Weave in their role only as a brief secondary touch — e.g. "...including the technical pushback your engineers get explaining architecture to non-technical buyers."

   • IF THEY ARE A MANAGER / DELIVERY HEAD (Project Manager, Delivery Lead, Practice Head):
     State the company-wide capability first. Weave in their role only as a brief secondary touch — e.g. "...so it's not just your strongest performers who are client-ready."

   • IF THEY ARE BUSINESS / EXECUTIVE (CEO, Managing Director, BU Head, VP):
     Already company-wide by nature — state it directly: client-facing confidence and consistency across the whole organization, every team that talks to clients, not a point solution for one group.

3. ZERO JARGON — PLAIN HUMAN ENGLISH:
   - FORBIDDEN: "simulation", "AI sandbox", "roleplay engine", "behavioral diagnostics".
   - Explain what A3CEND does simply: "mock client calls with an AI that acts like the customer", "practicing tricky client meetings before going live", "getting teams ready for client conversations without senior managers having to shadow every call".

4. FULLY DYNAMIC — NO STATIC TEMPLATES OR CANNED OPENERS:
   - STRICTLY FORBIDDEN: Starting with "As a [title/role]..." (e.g. "As a tech leader", "As a sales lead"), "In your role as...", "Given your role...", "With your background in...", "Noticed you're leading...", "Saw that you are...", "Hope this finds you well".
   - Jump straight to the conversation or real-world client observation, using Apify scraped LinkedIn/Company background if available. Lead with A3CEND's company-wide capability, not with their department's problem:
     • For tech: "Hi [Name], A3CEND helps client-facing teams at [Company] practice real client conversations with an AI before they're live — including the technical pushback engineers get explaining architecture to non-technical buyers."
     • For sales: "Hi [Name], A3CEND helps client-facing teams at [Company] get comfortable with tough client conversations through mock practice with an AI — objection handling and pricing pushback included, the stuff your team deals with daily."
     • For managers: "Hi [Name], A3CEND helps every client-facing team at [Company] get consistently client-ready through mock AI practice — not just the strongest performers, which cuts down how much shadowing senior managers have to do."
   - Every single email must be written from scratch, spontaneously tailored to that exact person, role, and company.
   - Keep it short: 3 to 4 sentences max (under 60 words).
   - NO fake statistics (never say "saved 50 hours", "40% faster").

5. MULTI-STEP PROGRESSION RULES (PROGRESSIVE VALUE, NEVER REPEAT):
   • Step 1 (Initial Outreach):
     - Sentence 1: A3CEND's company-wide capability as the subject (per rule 2 above) — NOT their department's problem.
     - Sentence 2 (optional, brief): their role woven in as a secondary, personalizing clause — a detail or reason they'd relate to it, not a restatement of the pitch.
     - 1 simple casual question.
   • Step 2 (First Follow-up):
     - 2 to 3 sentences maximum.
     - Naturally follow up on the previous note without guilt-tripping ("Per my previous email" is FORBIDDEN). Stay company-wide in subject; their role still only colors a clause (e.g. a specific scenario like objection handling or high-stakes client reviews), it doesn't become the sentence's subject.
     - Subject: If previous was opened, keep thread continuity with "re: [previous subject]" or a short 2-3 word followup. If not opened, try a fresh lowercase subject.
   • Step 3 (Angle Pivot / Concrete Use Case):
     - 2 to 3 sentences maximum.
     - Shift angle entirely. For example: if step 1 focused on team readiness, focus step 3 on saving senior leadership hours from having to shadow calls, or how technical architects get comfortable explaining systems to business clients. Whatever the new angle, state it as a company-wide benefit first — their role still only colors it afterward, never becomes the subject.
   • Step 4 (Low-Friction Check-in):
     - 1 to 2 short sentences.
     - Low-pressure check-in: Ask if client readiness or mock practice is a priority this quarter, or if there's someone else on their team who oversees client capability enablement.
   • Step 5 (Final Graceful Close):
     - 2 short sentences.
     - Acknowledge they are busy, graciously bow out, and leave the door open if priorities align in the future.

   • Re-engagement After Team Manual Reply (Action = REENGAGE_THREAD):
     - 1 to 2 short sentences.
     - Subject MUST be "re: [previous subject]" to maintain conversational thread continuity.
     - Courteous check-in (e.g. "Hi [First Name], following up on our previous note — wanted to check if you had a chance to look over this or if there are any questions I can answer?").
     - Never re-pitch from scratch.

   CRITICAL FOR ALL FOLLOW-UPS (Step > 1):
   - NEVER repeat the same greeting or re-introduce A3CEND from scratch like a cold pitch.
   - Do NOT say "Per my previous email" or "Just bumping this to the top of your inbox".
   - Talk like a genuine human colleague having a thoughtful B2B conversation.

6. CASUAL, LOW-PRESSURE QUESTION:
   - One simple question asking if mock practice or client readiness is something their team is exploring — or something being looked at more broadly across the company's client-facing teams.
   - 2 to 4 word lowercase subject line (or "re: [previous subject]" if continuing a thread).

Required JSON Output Schema:
{
  "recipient_analysis": "Your internal assessment: 1) What does their company do? 2) What is their exact role (sales vs tech vs manager vs business)? 3) How Apify web data/LinkedIn background influenced this dynamic angle. 4) Confirm the email's SUBJECT is A3CEND's company-wide capability, not their department's problem — and their role appears only as a brief secondary touch, never as the opening hook or the dominant framing.",
  "subject": "2 to 4 word lowercase subject line, completely tailored and spontaneous",
  "body_text": "Plain text email (3-4 short sentences, under 60 words, NO fake stats, NO 'simulation' jargon). Ends with: Best regards,\\n${resolvedSender}",
  "body_paragraphs_html": "Clean HTML markup using <p> tags for each paragraph. Ends with: <p style=\\"margin-bottom: 20px;\\">Best regards,<br>${resolvedSender}</p>",
  "call_to_action": "The specific question you asked",
  "messaging_angle": "The unique role-based angle (Sales, Technical, Manager, or Business)",
  "personalization_highlights": ["Specific detail about the company or LinkedIn profile leveraged"]
}`

  const apifyIntel = context.contact.ai_profile?.apify_enrichment

  const userPrompt = `Generate personalized email:
RECIPIENT:
First Name: ${context.contact.first_name}
Last Name: ${context.contact.last_name || ''}
Email: ${context.contact.email}
Company: ${context.contact.company || 'their organization'}
Designation: ${context.contact.designation || 'Leader'}
Department: ${context.contact.department || 'N/A'}
Industry: ${context.contact.industry || 'Technology'}
Persona: ${context.contact.persona || 'Technical / Executive'}
Role Category: ${context.contact.role_category || 'Technical'}
Relevant Use Cases: ${JSON.stringify(context.contact.relevant_use_cases || [])}

${apifyIntel ? `APIFY WEB & LINKEDIN SEARCH INTELLIGENCE:
• Company About (Scraped via Apify): ${apifyIntel.company_about || 'N/A'}
• Company Highlights: ${JSON.stringify(apifyIntel.company_highlights || [])}
• Person (LinkedIn) About (Scraped via Apify): ${apifyIntel.person_linkedin_about || 'N/A'}
• Person Key Insights: ${JSON.stringify(apifyIntel.person_key_insights || [])}
` : ''}

SENDER:
From: ${resolvedSender} <${resolvedEmail}>
Campaign: ${context.campaign.name}
${context.custom_instructions ? `CAMPAIGN CUSTOM INSTRUCTIONS: ${context.custom_instructions}` : ''}
${context.messaging_guidelines ? `CAMPAIGN MESSAGING GUIDELINES: ${context.messaging_guidelines}` : ''}
${context.target_tone ? `TARGET TONE: ${context.target_tone}` : ''}

SEQUENCE STEP: ${context.step}

AI DECISION & STRATEGY:
Action: ${context.decision.action}
Reason: ${context.decision.reason}
Strategy: ${context.decision.strategy || 'N/A'}
Suggested Angle: ${context.decision.suggested_angle || 'N/A'}
Tone: ${context.decision.tone || context.target_tone || 'Casual, crisp & direct'}

INTERACTION STATUS:
Opens: ${context.interaction_summary.opened_count}
Last Opened: ${context.interaction_summary.last_opened_at || 'Never'}

PREVIOUS EMAILS IN THIS THREAD:
${context.previous_emails
      .map(
        (e) => `[Outbound Email Step ${e.step}]
Subject: ${e.subject}
Body: ${e.body_text}`
      )
      .join('\n\n') || 'None (This is the first email)'}

PREVIOUS REPLIES RECEIVED FROM RECIPIENT:
${(context.replies_history || [])
      .map(
        (r) => `[Inbound Reply from ${r.from_email}]
Subject: ${r.subject}
Body: ${r.body_text}`
      )
      .join('\n\n') || 'None (No prior replies from prospect)'}
`

  const result = await generateStructuredJson<GeneratedEmailOutput & { body_paragraphs_html?: string }>({
    systemPrompt,
    userPrompt,
    temperature: 0.75,
  })

  const sanitizedText = sanitizeEmailBody(result.body_text || '')
  const rawParagraphs = result.body_paragraphs_html || result.body_html || ''
  const sanitizedParagraphs = sanitizeEmailBody(rawParagraphs)

  const signatureHtml = buildA3CENDSignature(
    resolvedSender,
    resolvedEmail,
    context.campaign.from_title || undefined
  )

  const cleanParagraphs = sanitizedParagraphs.replace(/<table[\s\S]*?<\/table>/gi, '').trim()

  const completeHtml = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b; max-width: 580px; margin: 0 auto;">${cleanParagraphs}${signatureHtml}</div>`

  return {
    ...result,
    body_text: sanitizedText,
    body_html: completeHtml,
  }
}

export function sanitizeEmailBody(text: string): string {
  if (!text) return text
  let cleaned = text

  // 1. Strip "As a [role], " immediately following greeting e.g. "Hi Nikshitha, As a tech leader, ..." -> "Hi Nikshitha, "
  cleaned = cleaned.replace(
    /((?:Hi|Hey|Hello)\s+[^\n,]+,\s*)(?:as\s+(?:a|an|the)\s+[^,\.\n]+,\s*)/gi,
    (_match, greeting) => greeting
  )

  // 2. Strip "As a [role], " at the start of any sentence or paragraph
  cleaned = cleaned.replace(
    /(^|[.!?]\s+|<p[^>]*>\s*)(?:as\s+(?:a|an|the)\s+[^,\.\n<]{3,45},\s*)/gim,
    (_match, prefix) => prefix
  )

  // 3. Strip "In your role as [role], " or "Given your role as [role], "
  cleaned = cleaned.replace(
    /((?:Hi|Hey|Hello)\s+[^\n,]+,\s*)(?:(?:in|given|with)\s+your\s+role\s+as\s+[^,\.\n]+,\s*)/gi,
    (_match, greeting) => greeting
  )

  // 4. Capitalize first letter after greeting if lowercased
  cleaned = cleaned.replace(
    /((?:Hi|Hey|Hello)\s+[^\n,]+,\s+)([a-z])/g,
    (_match, prefix, char) => prefix + char.toUpperCase()
  )

  // 5. Capitalize first letter inside <p> tag if lowercased
  cleaned = cleaned.replace(
    /(<p[^>]*>\s*)([a-z])/gi,
    (_match, prefix, char) => prefix + char.toUpperCase()
  )

  return cleaned
}

export async function analyzeReply(
  input: ReplyAnalysisInput
): Promise<ReplyAnalysisOutput> {
  const systemPrompt = `You are the AI Inbound Reply Analyzer for A3CEND.
Analyze incoming email replies to determine intent, sentiment, and the appropriate next action.

Categories of intent:
- interested: Positive response, wants demo/meeting/more info.
- not_interested: Clear polite or blunt rejection.
- asking_information: Asking technical/pricing/product questions.
- wants_meeting: Proposing dates/times or asking for calendar link.
- objection: Raising specific timing, budget, or competitor concerns.
- out_of_office: Auto-reply / out of office notification.
- unsubscribe: Asking to be removed / stop emailing.
- other: Unclear or miscellaneous.

Required JSON Output Schema:
{
  "intent": "interested | not_interested | asking_information | wants_meeting | objection | out_of_office | unsubscribe | other",
  "sentiment": "positive | neutral | negative",
  "summary": "Brief 1-sentence summary of the reply",
  "suggested_action": "HAND_TO_HUMAN | STOP | WAIT | SEND_RELEVANT_CONTENT",
  "reason": "Why this action is suggested",
  "action_needed_by_human": true
}`

  const userPrompt = `Analyze this reply:
From: ${input.reply.from_email}
Subject: ${input.reply.subject || 'N/A'}
Body:
${input.reply.body_text || input.reply.body_html || 'Empty reply'}

Contact details: ${input.contact ? `${input.contact.first_name} ${input.contact.last_name || ''} (${input.contact.company})` : 'Unknown'}
`

  return generateStructuredJson<ReplyAnalysisOutput>({
    systemPrompt,
    userPrompt,
    temperature: 0.1,
  })
}
