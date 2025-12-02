
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { Vendor } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Upload } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';


const profileFormSchema = z.object({
  name: z.string().min(2, "Company name is required."),
  contactPerson: z.string().min(2, "Contact person is required."),
  phone: z.string().min(10, "A valid phone number is required."),
  address: z.string().min(10, "A valid address is required."),
  licenseFile: z.any().optional(),
  taxIdFile: z.any().optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function VendorProfilePage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setSubmitting] = useState(false);
    const storageKey = `vendor-profile-form-${user?.vendorId}`;

    const form = useForm<ProfileFormValues>({
        resolver: zodResolver(profileFormSchema),
        defaultValues: {
            name: '',
            contactPerson: '',
            phone: '',
            address: '',
        }
    });

    useEffect(() => {
        if (user?.vendorId) {
            setLoading(true);
            fetch(`/api/vendors`)
                .then(res => res.json())
                .then((vendors: Vendor[]) => {
                    const currentVendor = vendors.find(v => v.id === user.vendorId);
                    if (currentVendor) {
                        setVendor(currentVendor);
                        const savedData = localStorage.getItem(storageKey);
                        if (savedData) {
                            try {
                                form.reset(JSON.parse(savedData));
                                toast({ title: 'Draft Restored', description: 'Your unsaved profile changes have been restored.' });
                            } catch (e) {
                                console.error("Failed to parse saved profile data", e);
                            }
                        } else {
                             form.reset({
                                name: currentVendor.name,
                                contactPerson: currentVendor.contactPerson,
                                phone: currentVendor.phone,
                                address: currentVendor.address,
                            });
                        }
                    }
                })
                .catch(err => {
                    toast({ variant: 'destructive', title: 'Error', description: 'Failed to fetch vendor details.'});
                    console.error(err);
                })
                .finally(() => setLoading(false));
        }
    }, [user, form, toast, storageKey]);

    useEffect(() => {
        const subscription = form.watch((value) => {
            localStorage.setItem(storageKey, JSON.stringify(value));
        });
        return () => subscription.unsubscribe();
    }, [form, storageKey]);

    const uploadFile = async (file: File, directory: string) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('directory', directory);

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'File upload failed');
        }
        return result.path;
    };

    const onSubmit = async (values: ProfileFormValues) => {
        if (!vendor) return;

        setSubmitting(true);
        try {
            let licensePath = vendor.kycDocuments?.find(d => d.name === 'Business License')?.url;
            let taxIdPath = vendor.kycDocuments?.find(d => d.name === 'Tax ID Document')?.url;

            if (values.licenseFile && values.licenseFile[0]) {
                licensePath = await uploadFile(values.licenseFile[0], 'kyc');
            }
            if (values.taxIdFile && values.taxIdFile[0]) {
                taxIdPath = await uploadFile(values.taxIdFile[0], 'kyc');
            }
            
            const resubmitData = {
                ...values,
                licensePath,
                taxIdPath,
            };

            const response = await fetch(`/api/vendors/${vendor.id}/resubmit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(resubmitData),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update profile.');
            }
            
            localStorage.removeItem(storageKey);
            toast({ title: 'Profile Updated', description: 'Your information has been submitted for verification.'});

        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Update Failed',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        } finally {
            setSubmitting(false);
        }
    };


    if (loading) {
        return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>
    }

    if (!vendor) {
        return <Card><CardHeader><CardTitle>Error</CardTitle></CardHeader><CardContent>Vendor details not found.</CardContent></Card>
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Your Vendor Profile</CardTitle>
                <CardDescription>Manage your company information and verification documents.</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                        <div className="grid md:grid-cols-2 gap-6">
                            <FormField control={form.control} name="name" render={({field}) => (<FormItem><FormLabel>Company Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>)} />
                            <FormField control={form.control} name="contactPerson" render={({field}) => (<FormItem><FormLabel>Contact Person</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>)} />
                            <FormField control={form.control} name="phone" render={({field}) => (<FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>)} />
                            <FormField control={form.control} name="address" render={({field}) => (<FormItem><FormLabel>Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>)} />
                        </div>

                        <h3 className="text-lg font-semibold border-t pt-6">Verification Documents</h3>

                         <div className="grid md:grid-cols-2 gap-6 items-end">
                            <FormField
                                control={form.control}
                                name="licenseFile"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Business License</FormLabel>
                                    <FormControl>
                                        <Input type="file" accept=".pdf" onChange={(e) => field.onChange(e.target.files)} />
                                    </FormControl>
                                    <FormDescription>Upload a new file to replace the existing one.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="taxIdFile"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Tax ID Document</FormLabel>
                                    <FormControl>
                                        <Input type="file" accept=".pdf" onChange={(e) => field.onChange(e.target.files)} />
                                    </FormControl>
                                    <FormDescription>Upload a new file to replace the existing one.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                         </div>

                        <div className="flex justify-end">
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                <Save className="mr-2 h-4 w-4"/>
                                Save Changes & Resubmit
                            </Button>
                        </div>

                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
