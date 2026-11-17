import { type IDataObject, type ICredentialType, type INodeProperties } from 'n8n-workflow';

export class SeventeenTrackApi implements ICredentialType {
	icon = 'file:seventeenTrack.svg';

	name = 'seventeenTrackApi';

	displayName = '17TRACK API';

	documentationUrl = 'https://docs.17track.net';

	test = {
		request: {
			method: 'POST' as const,
			url: 'https://api.17track.net/track/v2.4/getquota',
			body: '[]' as unknown as IDataObject,
			headers: { 'content-type': 'application/json' },
		},
	};

	properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      description:
        '17TRACK API key sent in the 17token header. Get or change the key in 17TRACK API Settings: https://api.17track.net/admin/settings',
    },
  ];

  authenticate = {
    type: 'generic' as const,
    properties: {
      headers: {
        '17token': '={{$credentials.apiKey}}',
      },
    },
  };
}
