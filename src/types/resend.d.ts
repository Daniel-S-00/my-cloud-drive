declare module 'resend' {
  export class Resend {
    constructor(apiKey: string);
    emails: {
      send(input: {
        to: string;
        from: string;
        subject: string;
        html: string;
      }): Promise<unknown>;
    };
  }
}
