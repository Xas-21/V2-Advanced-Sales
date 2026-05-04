import { normalizeRequestTypeKey } from './requestTypeUtils';

export type FeedbackTemplateType = 'event' | 'accommodation' | 'event_rooms';
export type FeedbackAnswerValue = string | number | null;

export type FeedbackQuestion = {
    id: string;
    prompt: string;
    type: 'stars' | 'yesno' | 'yesno_na' | 'score10' | 'text' | 'stars_na';
};

export type FeedbackSection = {
    title: string;
    questions: FeedbackQuestion[];
};

export type FeedbackTemplate = {
    type: FeedbackTemplateType;
    intro: string;
    sections: FeedbackSection[];
    submitMessage: string;
};

const EVENT_TEMPLATE: FeedbackTemplate = {
    type: 'event',
    intro:
        'Thank you for choosing {{propertyName}} for your recent event. To help us ensure every gathering we host meets the highest standard of excellence, we would be honored if you could share your experience with us.',
    sections: [
        {
            title: 'Section 1: Event Planning & Coordination',
            questions: [
                {
                    id: 'planning_team',
                    prompt:
                        'How would you rate the responsiveness and professionalism of our Sales and Events team during the planning phase?',
                    type: 'stars',
                },
                {
                    id: 'requirements_accuracy',
                    prompt: 'Were your event requirements and bespoke requests understood and executed accurately?',
                    type: 'yesno',
                },
            ],
        },
        {
            title: 'Section 2: Venue & Facilities',
            questions: [
                {
                    id: 'venue_quality',
                    prompt: 'How would you rate the cleanliness, ambiance, and setup of the event venue?',
                    type: 'stars',
                },
                {
                    id: 'av_support',
                    prompt: 'Did the audio-visual (AV) equipment and technical support meet your expectations?',
                    type: 'stars_na',
                },
            ],
        },
        {
            title: 'Section 3: Culinary & Banquet Services',
            questions: [
                {
                    id: 'fnb_quality',
                    prompt:
                        'How would you rate the quality, presentation, and variety of the food and beverage served during your event?',
                    type: 'stars',
                },
                {
                    id: 'banquet_attentiveness',
                    prompt: 'How would you rate the attentiveness of our banquet service team?',
                    type: 'stars',
                },
            ],
        },
        {
            title: 'Section 4: Overall Experience',
            questions: [
                {
                    id: 'recommendation_score',
                    prompt: 'How likely are you to host another event with us or recommend our venues to a colleague?',
                    type: 'score10',
                },
                {
                    id: 'insights',
                    prompt: 'What was the highlight of your event, and is there any area where we can improve?',
                    type: 'text',
                },
            ],
        },
    ],
    submitMessage:
        'Thank you for your partnership. Your insights are invaluable to us. Delivering seamless and memorable events is our ultimate goal, and your feedback ensures we continue to elevate our standards. Should you wish to discuss future events or corporate gatherings, our Sales team remains at your complete disposal.',
};

const ACCOMMODATION_TEMPLATE: FeedbackTemplate = {
    type: 'accommodation',
    intro:
        'It was our privilege to welcome you to {{propertyName}}. We constantly strive to perfect the art of hospitality, and your insights are vital to our journey. Please take a few moments to reflect on your stay.',
    sections: [
        {
            title: 'Section 1: Arrival & Departure',
            questions: [
                {
                    id: 'arrival_departure',
                    prompt: 'How would you rate the efficiency and warmth of your check-in and check-out experience?',
                    type: 'stars',
                },
                {
                    id: 'welcome_feeling',
                    prompt: 'Did our reception team make you feel welcomed and valued upon arrival?',
                    type: 'yesno',
                },
            ],
        },
        {
            title: 'Section 2: The Accommodation',
            questions: [
                {
                    id: 'room_comfort',
                    prompt: 'How would you rate the comfort, design, and cleanliness of your room or villa?',
                    type: 'stars',
                },
                {
                    id: 'room_amenities',
                    prompt: 'Were the in-room amenities to your satisfaction?',
                    type: 'stars',
                },
            ],
        },
        {
            title: 'Section 3: Dining & Resort Facilities',
            questions: [
                {
                    id: 'culinary_experience',
                    prompt: 'How would you rate your overall culinary experience at our restaurants?',
                    type: 'stars_na',
                },
                {
                    id: 'resort_facilities',
                    prompt: 'How would you rate our resort facilities (e.g., pool, lounge areas)?',
                    type: 'stars_na',
                },
            ],
        },
        {
            title: 'Section 4: The Service & Overall Impression',
            questions: [
                {
                    id: 'overall_hospitality',
                    prompt: 'How would you rate the overall hospitality and professionalism of the Shaden Resort team?',
                    type: 'stars',
                },
                {
                    id: 'insights',
                    prompt: 'Please share any additional comments or mention any team member who made your stay exceptional.',
                    type: 'text',
                },
            ],
        },
    ],
    submitMessage:
        'Thank you for your time and insights. We are truly grateful for your feedback. It is through the eyes of our valued guests that we continue to refine the Shaden Resort experience. We hope the majestic landscapes of AlUla provided you with unforgettable memories, and we look forward to the honor of welcoming you back in the future.',
};

const EVENT_WITH_ROOMS_TEMPLATE: FeedbackTemplate = {
    type: 'event_rooms',
    intro:
        'Thank you for entrusting {{propertyName}} with your recent group event and accommodation needs. Managing comprehensive experiences is our specialty, and your feedback is essential to helping us deliver flawless execution for our esteemed partners.',
    sections: [
        {
            title: 'Section 1: Pre-Arrival & Group Coordination',
            questions: [
                {
                    id: 'booking_coordination',
                    prompt:
                        'How would you rate the efficiency of the booking process, contracting, and pre-arrival coordination with our Sales team?',
                    type: 'stars',
                },
                {
                    id: 'group_checkin',
                    prompt: 'How smoothly did the group check-in and room allocation process go?',
                    type: 'stars',
                },
            ],
        },
        {
            title: 'Section 2: The Accommodation Experience',
            questions: [
                {
                    id: 'delegate_rooms',
                    prompt:
                        'How satisfied were your delegates/guests with the comfort and cleanliness of their rooms and villas?',
                    type: 'stars',
                },
                {
                    id: 'vip_requests',
                    prompt: 'Were all VIP requests and room drops handled according to your instructions?',
                    type: 'yesno_na',
                },
            ],
        },
        {
            title: 'Section 3: Event Execution & Venues',
            questions: [
                {
                    id: 'meeting_spaces',
                    prompt: 'How would you rate the meeting spaces, including setup, comfort, and technological readiness?',
                    type: 'stars',
                },
                {
                    id: 'catering_timing',
                    prompt: 'How would you rate the quality and timing of the catered meals and coffee breaks?',
                    type: 'stars',
                },
            ],
        },
        {
            title: 'Section 4: Overall Value & Partnership',
            questions: [
                {
                    id: 'onsite_support',
                    prompt: 'How would you rate the on-site support provided by our events and operations team during your program?',
                    type: 'stars',
                },
                {
                    id: 'future_likelihood',
                    prompt: 'How likely are you to select Shaden Resort AlUla for your next group or corporate retreat?',
                    type: 'score10',
                },
                {
                    id: 'insights',
                    prompt: 'Please share any specific feedback regarding what worked exceptionally well and where we can enhance our group offerings.',
                    type: 'text',
                },
            ],
        },
    ],
    submitMessage:
        'Thank you for your trust and collaboration. Coordinating a multifaceted event requires a strong partnership, and we deeply appreciate the feedback you have provided. Your insights will be shared directly with our executive and operations teams to ensure we consistently deliver the premium standard you expect. We look forward to a continued relationship and to hosting your future delegations.',
};

export function getFeedbackTemplateForRequestType(requestTypeRaw: any): FeedbackTemplate {
    const key = normalizeRequestTypeKey(String(requestTypeRaw || ''));
    if (key === 'event') return EVENT_TEMPLATE;
    if (key === 'event_rooms') return EVENT_WITH_ROOMS_TEMPLATE;
    return ACCOMMODATION_TEMPLATE;
}

export function buildInitialFeedbackAnswers(template: FeedbackTemplate): Record<string, FeedbackAnswerValue> {
    const out: Record<string, FeedbackAnswerValue> = {};
    for (const section of template.sections) {
        for (const q of section.questions) out[q.id] = q.type === 'text' ? '' : null;
    }
    return out;
}

export function withPropertyName(templateText: string, propertyName: string): string {
    return templateText.replace(/\{\{propertyName\}\}/g, propertyName || 'our property');
}
