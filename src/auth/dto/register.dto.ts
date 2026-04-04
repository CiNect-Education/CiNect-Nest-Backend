import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { IsOptional } from 'class-validator';
export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString({ message: 'Email phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Email là bắt buộc' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email: string;

  @ApiProperty({ example: 'SecurePass@123', minLength: 8 })
  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mật khẩu là bắt buộc' })
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
  @Matches(/^[A-Za-z0-9@#$%!_]+$/, {
    message: 'Mật khẩu chỉ được chứa chữ, số hoặc ký tự @ # $ % ! _',
  })
  password: string;

  // Optional: some clients send confirmPassword for UX validation
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  confirmPassword?: string;

  @ApiProperty({ example: 'Nguyen Van A' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ example: '0901234567' })
  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Số điện thoại là bắt buộc' })
  @Matches(/^0\\d{9}$/, {
    message: 'Số điện thoại phải bắt đầu bằng 0 và có đúng 10 chữ số',
  })
  phoneNumber: string;
}
