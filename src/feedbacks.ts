import { combineRgb, type CompanionFeedbackDefinitions } from '@companion-module/base'
import type { ModuleInstance } from './main.js'

export function UpdateFeedbacks(self: ModuleInstance): void {
	const sourceChoices = self.getSourceChoices()
	const inputChoices = self.getInputChoices()
	const destinationVideoSourceChoices = self.getDestinationVideoSourceChoices()
	const endpointVideoSourceChoices = self.getEndpointVideoSourceChoices()
	const destinationChoices = self.getDestinationChoices()
	const endpointChoices = self.endpoints.map((endpoint) => ({
		id: endpoint.host,
		label: `${endpoint.label} (${endpoint.host})`,
	}))

	const feedbacks: CompanionFeedbackDefinitions = {
		connected: {
			type: 'boolean',
			name: 'Connected',
			description: 'True when at least one configured or discovered endpoint is reachable.',
			defaultStyle: {
				bgcolor: combineRgb(0, 150, 65),
				color: combineRgb(255, 255, 255),
			},
			options: [],
			callback: () => self.isReady,
		},
		endpoint_discovered: {
			type: 'boolean',
			name: 'Endpoint discovered',
			description: 'True when the endpoint host is in the discovered endpoint cache.',
			defaultStyle: {
				bgcolor: combineRgb(0, 120, 180),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'host',
					type: 'textinput',
					label: 'Endpoint host',
					default: '',
					useVariables: true,
				},
			],
			callback: async (feedback, context) => {
				const host = await context.parseVariablesInString(String(feedback.options.host ?? ''))
				return self.isEndpointDiscovered(host)
			},
		},
		endpoint_mode: {
			type: 'boolean',
			name: 'Endpoint encoder / decoder mode',
			description: 'True when the endpoint is currently in the selected DeviceSpecific.DeviceMode.',
			defaultStyle: {
				bgcolor: combineRgb(0, 145, 80),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'endpoint',
					type: 'dropdown',
					label: 'Endpoint',
					default: endpointChoices[0]?.id ?? '',
					choices: endpointChoices.length > 0 ? endpointChoices : [{ id: '', label: 'No endpoints discovered yet' }],
				},
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					default: 'Receiver',
					choices: [
						{ id: 'Transmitter', label: 'Encoder / Transmitter' },
						{ id: 'Receiver', label: 'Decoder / Receiver' },
					],
				},
			],
			callback: (feedback) => {
				const mode = feedback.options.mode === 'Transmitter' ? 'Transmitter' : 'Receiver'
				return self.isEndpointMode(String(feedback.options.endpoint ?? ''), mode)
			},
		},
		usb_mode: {
			type: 'boolean',
			name: 'USB mode',
			description: 'True when the endpoint USB mode matches DEVICE (COMPUTER) or HOST (USB PERIPHERAL).',
			defaultStyle: {
				bgcolor: combineRgb(0, 145, 80),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'endpoint',
					type: 'dropdown',
					label: 'Endpoint',
					default: endpointChoices[0]?.id ?? '',
					choices: endpointChoices.length > 0 ? endpointChoices : [{ id: '', label: 'No endpoints discovered yet' }],
				},
				{
					id: 'mode',
					type: 'dropdown',
					label: 'USB mode',
					default: 'Local',
					choices: [
						{ id: 'Local', label: 'DEVICE (COMPUTER)' },
						{ id: 'Remote', label: 'HOST (USB PERIPHERAL)' },
					],
				},
			],
			callback: (feedback) => {
				const mode = feedback.options.mode === 'Remote' ? 'Remote' : 'Local'
				return self.isUsbMode(String(feedback.options.endpoint ?? ''), mode)
			},
		},
		active_destination: {
			type: 'boolean',
			name: 'Active destination',
			description: 'True when this decoder is the active routing destination.',
			defaultStyle: {
				bgcolor: combineRgb(0, 90, 180),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'destination',
					type: 'dropdown',
					label: 'Destination',
					default: destinationChoices[0]?.id ?? '',
					choices:
						destinationChoices.length > 0 ? destinationChoices : [{ id: '', label: 'No destinations discovered yet' }],
				},
			],
			callback: (feedback) => self.getActiveDestination()?.host === feedback.options.destination,
		},
		source_routed_default: {
			type: 'boolean',
			name: 'Source routed using default mode',
			description:
				'True when the active destination route matches this source using the configured default route mode.',
			defaultStyle: {
				bgcolor: combineRgb(0, 145, 80),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'source',
					type: 'dropdown',
					label: 'Source',
					default: sourceChoices[0]?.id ?? '',
					choices: sourceChoices.length > 0 ? sourceChoices : [{ id: '', label: 'No sources discovered yet' }],
				},
			],
			callback: (feedback) =>
				self.isSourceRouted(String(feedback.options.source ?? ''), self.config.defaultRouteMode ?? 'av-usb'),
		},
		video_source_routed: {
			type: 'boolean',
			name: 'Video source routed',
			description: 'True when active destination video source matches.',
			defaultStyle: {
				bgcolor: combineRgb(0, 95, 190),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'source',
					type: 'dropdown',
					label: 'Source',
					default: sourceChoices[0]?.id ?? '',
					choices: sourceChoices.length > 0 ? sourceChoices : [{ id: '', label: 'No sources discovered yet' }],
				},
			],
			callback: (feedback) => self.isSourceRouted(String(feedback.options.source ?? ''), 'video'),
		},
		audio_source_routed: {
			type: 'boolean',
			name: 'Audio source routed',
			description: 'True when active destination audio source matches.',
			defaultStyle: {
				bgcolor: combineRgb(110, 75, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'source',
					type: 'dropdown',
					label: 'Source',
					default: sourceChoices[0]?.id ?? '',
					choices: sourceChoices.length > 0 ? sourceChoices : [{ id: '', label: 'No sources discovered yet' }],
				},
			],
			callback: (feedback) => self.isSourceRouted(String(feedback.options.source ?? ''), 'audio'),
		},
		usb_source_routed: {
			type: 'boolean',
			name: 'USB source routed',
			description: 'True when active destination USB source matches.',
			defaultStyle: {
				bgcolor: combineRgb(95, 50, 145),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'source',
					type: 'dropdown',
					label: 'Source',
					default: sourceChoices[0]?.id ?? '',
					choices: sourceChoices.length > 0 ? sourceChoices : [{ id: '', label: 'No sources discovered yet' }],
				},
			],
			callback: (feedback) => self.isSourceRouted(String(feedback.options.source ?? ''), 'usb'),
		},
		input_selected: {
			type: 'boolean',
			name: 'Encoder input selected',
			description: 'True when the encoder reports the selected DeviceSpecific.VideoSource or ActiveVideoSource.',
			defaultStyle: {
				bgcolor: combineRgb(0, 145, 80),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'input',
					type: 'dropdown',
					label: 'Encoder input',
					default: inputChoices[0]?.id ?? '',
					choices: inputChoices.length > 0 ? inputChoices : [{ id: '', label: 'No encoder inputs discovered yet' }],
				},
			],
			callback: (feedback) => self.isInputSelected(String(feedback.options.input ?? '')),
		},
		destination_video_source_selected: {
			type: 'boolean',
			name: 'Decoder video source selected',
			description: 'True when the decoder reports the selected STREAM or local HDMI input source.',
			defaultStyle: {
				bgcolor: combineRgb(0, 145, 80),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'source',
					type: 'dropdown',
					label: 'Decoder video source',
					default: destinationVideoSourceChoices[0]?.id ?? '',
					choices:
						destinationVideoSourceChoices.length > 0
							? destinationVideoSourceChoices
							: [{ id: '', label: 'No decoder video sources discovered yet' }],
				},
			],
			callback: (feedback) => self.isInputSelected(String(feedback.options.source ?? '')),
		},
		endpoint_video_source_selected: {
			type: 'boolean',
			name: 'Endpoint video source selected',
			description: 'True when the endpoint reports the selected video source or local HDMI input.',
			defaultStyle: {
				bgcolor: combineRgb(0, 145, 80),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'source',
					type: 'dropdown',
					label: 'Endpoint video source',
					default: endpointVideoSourceChoices[0]?.id ?? '',
					choices:
						endpointVideoSourceChoices.length > 0
							? endpointVideoSourceChoices
							: [{ id: '', label: 'No endpoint video sources discovered yet' }],
				},
			],
			callback: (feedback) => self.isInputSelected(String(feedback.options.source ?? '')),
		},
		stream_subscribed: {
			type: 'boolean',
			name: 'Stream subscribed',
			description: 'True when the source status reports SUBSCRIBED.',
			defaultStyle: {
				bgcolor: combineRgb(0, 150, 65),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'source',
					type: 'dropdown',
					label: 'Source',
					default: sourceChoices[0]?.id ?? '',
					choices: sourceChoices.length > 0 ? sourceChoices : [{ id: '', label: 'No sources discovered yet' }],
				},
			],
			callback: (feedback) => self.getSource(String(feedback.options.source ?? ''))?.status === 'SUBSCRIBED',
		},
		sync_detected: {
			type: 'boolean',
			name: 'Sync detected',
			description: 'True when the source subscription reports sync detected.',
			defaultStyle: {
				bgcolor: combineRgb(0, 150, 65),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'source',
					type: 'dropdown',
					label: 'Source',
					default: sourceChoices[0]?.id ?? '',
					choices: sourceChoices.length > 0 ? sourceChoices : [{ id: '', label: 'No sources discovered yet' }],
				},
			],
			callback: (feedback) => self.getSource(String(feedback.options.source ?? ''))?.syncDetected === true,
		},
	}

	self.setFeedbackDefinitions(feedbacks)
}
