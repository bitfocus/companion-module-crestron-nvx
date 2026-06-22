import type { CompanionVariableDefinition } from '@companion-module/base'
import type { ModuleInstance } from './main.js'

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const definitions: CompanionVariableDefinition[] = [
		{ variableId: 'connected', name: 'Connected' },
		{ variableId: 'connection_status', name: 'Connection status' },
		{ variableId: 'last_error', name: 'Last error' },
		{ variableId: 'last_command', name: 'Last command sent' },
		{ variableId: 'last_response', name: 'Last response summary' },
		{ variableId: 'discovery_summary', name: 'Discovery summary' },
		{ variableId: 'discovered_count', name: 'Discovered endpoint count' },
		{ variableId: 'source_count', name: 'Discovered source count' },
		{ variableId: 'destination_count', name: 'Discovered destination count' },
		{ variableId: 'active_destination_host', name: 'Active destination host' },
		{ variableId: 'active_destination_name', name: 'Active destination name' },
		{ variableId: 'active_destination_model', name: 'Active destination model' },
		{ variableId: 'active_destination_mode', name: 'Active destination mode' },
		{ variableId: 'active_destination_usb_mode', name: 'Active destination USB mode' },
		{ variableId: 'active_destination_input', name: 'Active destination configured input' },
		{ variableId: 'active_destination_active_input', name: 'Active destination active input' },
		{ variableId: 'video_source', name: 'Active route video source UUID' },
		{ variableId: 'audio_source', name: 'Active route audio source UUID' },
		{ variableId: 'usb_source', name: 'Active route USB source UUID' },
		{ variableId: 'usb_follows_video', name: 'USB follows video' },
		{ variableId: 'secondary_audio_follows_video', name: 'Secondary audio follows video' },
		{ variableId: 'discovered_endpoints', name: 'Discovered endpoint summary' },
		{ variableId: 'discovered_sources', name: 'Discovered source summary' },
	]

	self.setVariableDefinitions(definitions)
}
