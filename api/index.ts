import * as httpModule from 'http';
import * as httpsModule from 'https';
import * as vscode from 'vscode';
import { outputConsole } from '../utils';

export class AtelierAPI {
  private cookies: string[] = [];

  private get config(): any {
    return vscode.workspace.getConfiguration('objectscript').get('conn');
  }

  private get ns(): string {
    return this.config.ns;
  }

  constructor() {}

  updateCookies(cookies: string[]) {
    cookies.forEach(cookie => {
      let [cookieName] = cookie.split('=');
      let index = this.cookies.findIndex(el => el.startsWith(cookieName));
      if (index) {
        this.cookies[index] = cookie;
      } else {
        this.cookies.push(cookie);
      }
    });
  }

  request(method: string, path?: string, params?: any, body?: any): Promise<any> {
    const headers = {
      Accept: 'application/json',
      Cookie: this.cookies
    };
    const buildParams = (): string => {
      if (!params) {
        return '';
      }
      let result = [];
      Object.keys(params).forEach(key => {
        let value = params[key];
        if (value && value !== '') {
          if (typeof value === 'boolean') {
            value = value ? '1' : '0';
          }
          result.push(`${key}=${value}`);
        }
      });
      return result.join('&');
    };
    method = method.toUpperCase();
    if (['PUT', 'POST'].includes(method)) {
      headers['Content-Type'] = 'application/json';
    }

    const { host, port, username, password } = this.config;
    const http: any = this.config.https ? httpsModule : httpModule;
    const agent = new http.Agent({ keepAlive: true, maxSockets: 10 });
    path = encodeURI(`/api/atelier/${path || ''}?${buildParams()}`);
    console.log('API request', path);
    return new Promise((resolve, reject) => {
      const req: httpModule.ClientRequest = http
        .request(
          {
            method,
            host,
            port,
            path,
            agent,
            auth: `${username}:${password}`,
            headers,
            body
          },
          (response: httpModule.IncomingMessage) => {
            if (response.statusCode < 200 || response.statusCode > 299) {
              reject(new Error('Failed to load page "' + path + '", status code: ' + response.statusCode));
            }
            this.updateCookies(response.headers['set-cookie']);
            // temporary data holder
            let body: string = '';
            response.on('data', chunk => {
              body += chunk;
            });
            response.on('end', () => {
              if (response.headers['content-type'].includes('json')) {
                const json = JSON.parse(body);
                if (json.console) {
                  outputConsole(json.console);
                }
                resolve(json);
              } else {
                resolve(body);
              }
            });
          }
        )
        .on('error', error => {
          reject(error);
        });
      if (['PUT', 'POST'].includes(method)) {
        req.write(JSON.stringify(body));
      }
      req.end();
    }).catch(error => {
      console.error(error);
      throw error;
    });
  }

  serverInfo(): Promise<any> {
    return this.request('GET');
  }

  getDocNames({
    generated = false,
    category = '*',
    type = '*',
    filter = ''
  }: {
    generated?: boolean;
    category?: string;
    type?: string;
    filter?: string;
  }): Promise<any> {
    return this.request('GET', `v2/${this.ns}/docnames/${category}/${type}`, {
      filter,
      generated
    });
  }

  getDoc(name: string, format?: string): Promise<any> {
    let params = {};
    if (format) {
      params = {
        format
      };
    }
    return this.request('GET', `v2/${this.ns}/doc/${name}`, params);
  }

  putDoc(name: string, data: { enc: boolean; content: string[] }, ignoreConflict?: boolean): Promise<any> {
    let params = { ignoreConflict };
    return this.request('PUT', `v2/${this.ns}/doc/${name}`, params, data);
  }

  actionIndex(docs: string[]): Promise<any> {
    return this.request('POST', `v2/${this.ns}/action/index`, {}, docs);
  }

  actionCompile(docs: string[], flags?: string, source = false): Promise<any> {
    return this.request('POST', `v2/${this.ns}/action/compile`, { flags, source }, docs);
  }
}