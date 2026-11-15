import { useState } from 'react';
import { Mail, MapPin, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';

const INFO = [
  { icon: Mail, label: 'Email', value: 'hello@yourdomain.com' },
  { icon: Phone, label: 'Phone', value: '+251 000 000 000' },
  { icon: MapPin, label: 'Address', value: 'Your city, Country' },
];

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [sent, setSent] = useState(false);

  const onChange =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: send `form` to your backend endpoint
    console.log(form);
    setSent(true);
    setForm({ name: '', email: '', message: '' });
  };

  return (
    <div className="py-12">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          Contact <span className="text-orange-600">us</span>
        </h1>
        <p className="mt-3 text-muted-foreground">
          Questions or want a workspace for your business? Send us a message.
        </p>
      </div>

      <div className="mt-10 grid gap-8 md:grid-cols-5">
        <div className="space-y-4 md:col-span-2">
          {INFO.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 rounded-xl border p-4">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-orange-100 text-orange-600">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-medium">{value}</p>
              </div>
            </div>
          ))}
        </div>

        <Card className="md:col-span-3">
          <CardContent className="pt-6">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" required value={form.name} onChange={onChange('name')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={form.email} onChange={onChange('email')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea id="message" rows={5} required value={form.message} onChange={onChange('message')} />
              </div>
              <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700">
                Send message
              </Button>
              {sent && (
                <p className="text-center text-sm text-green-600">Thanks! We will get back to you soon.</p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}